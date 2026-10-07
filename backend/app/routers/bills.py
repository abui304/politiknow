import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, exists, func, or_, select

from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.models import Bill, BillCosponsor, InteractionType, Legislator, SummaryReport, Vote
from app.ratelimit import enforce_hourly_limit
from app.schemas import (
    BillOut,
    BillPage,
    BillText,
    HashtagOut,
    StageOut,
    SummaryReportIn,
    TagOut,
    VoteIn,
    VoteOut,
)
from app.serializers import bills_out
from app.services import feed as feed_service
from app.services import hashtags, interactions
from app.services.legislators import PARTY_CODES, like_pattern, name_matches
from app.taxonomy import POLICY_AREAS

router = APIRouter(tags=["bills"])

# Status filters for search. "Awaiting" means the bill passed its own chamber and the other
# chamber's vote is next (simple resolutions never leave their chamber, so they're excluded).
STAGES = {
    "law": Bill.status == "became_law",
    "president": Bill.status == "to_president",
    "senate": Bill.bill_type.in_(("HR", "HJRES", "HCONRES")) & (Bill.status == "passed_house"),
    "house": Bill.bill_type.in_(("S", "SJRES", "SCONRES")) & (Bill.status == "passed_senate"),
    "committee": Bill.status == "in_committee",
    "vetoed": Bill.status == "vetoed",
}
Stage = Literal["law", "president", "senate", "house", "committee", "vetoed"]


async def _published_bill(db, bill_id: uuid.UUID) -> Bill:
    bill = await db.get(Bill, bill_id)
    if not bill or not bill.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
    return bill


@router.get("/tags", response_model=list[TagOut])
async def list_tags(_: CurrentUser):
    return [TagOut(name=name) for name in POLICY_AREAS]


@router.get("/hashtags", response_model=list[HashtagOut])
async def popular_hashtags(db: DB, _: CurrentUser, limit: int = Query(30, le=100)):
    """Hashtags used on at least two bills, most common first."""
    return [HashtagOut(name=name, bill_count=n) for name, n in await hashtags.popular(db, limit)]


def _has_hashtag(condition):
    """True when any of the bill's hashtags satisfies `condition(hashtag_column)`."""
    tags = func.jsonb_array_elements_text(Bill.sub_tags).table_valued("value")
    return exists(select(1).select_from(tags).where(condition(tags.c.value)))


@router.get("/stages", response_model=list[StageOut])
async def stage_counts(db: DB, _: CurrentUser):
    """How many published bills each status filter matches."""
    row = (await db.execute(
        select(*(func.count().filter(cond) for cond in STAGES.values())).where(Bill.is_published.is_(True))
    )).one()
    return [StageOut(key=key, bill_count=n) for key, n in zip(STAGES, row, strict=True)]


@router.get("/feed", response_model=BillPage)
async def get_feed(db: DB, redis: RedisDep, user: CurrentUser, cursor: int = 0, limit: int = Query(20, le=50)):
    bills, next_cursor = await feed_service.page(db, redis, user, cursor, limit)
    return BillPage(items=await bills_out(db, user, bills), next_cursor=next_cursor)


@router.get("/search", response_model=BillPage)
async def search(
    db: DB,
    user: CurrentUser,
    q: str | None = Query(None, max_length=200),
    tag: str | None = None,
    hashtag: str | None = Query(None, max_length=60),
    party: Literal["D", "R", "I"] | None = None,
    chamber: Literal["house", "senate"] | None = None,
    stage: Stage | None = None,
    cursor: int = 0,
    limit: int = Query(20, le=50),
):
    """Filter by topic, hashtag (exact, case-insensitive), sponsor's party, chamber, and/or status, and/or
    match words in the title, any hashtag, or a sponsor's or cosponsor's name. Title and hashtag
    matches rank above name matches."""
    stmt = select(Bill).where(Bill.is_published.is_(True))
    if tag:
        if tag not in POLICY_AREAS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown tag")
        stmt = stmt.where(Bill.primary_tags.contains([tag]))
    if hashtag and hashtags.clean(hashtag):
        wanted = hashtags.clean(hashtag).lower()
        stmt = stmt.where(_has_hashtag(lambda h: func.lower(h) == wanted))
    if party:
        stmt = stmt.where(Bill.sponsor_party.in_(PARTY_CODES[party]))
    if chamber:
        stmt = stmt.where(Bill.bill_type.startswith("H" if chamber == "house" else "S"))
    if stage:
        stmt = stmt.where(STAGES[stage])
    term = (q or "").strip().lstrip("#").strip()
    if term:
        pattern = like_pattern(term)
        about = or_(Bill.title.ilike(pattern, escape="\\"), _has_hashtag(lambda h: h.ilike(pattern, escape="\\")))
        named = select(Legislator.bioguide_id).where(name_matches(pattern))
        by_name = or_(
            Bill.sponsor_name.ilike(pattern, escape="\\"),
            Bill.sponsor_id.in_(named),
            Bill.id.in_(select(BillCosponsor.bill_id).where(BillCosponsor.bioguide_id.in_(named))),
        )
        stmt = stmt.where(or_(about, by_name)).order_by(
            case((about, 0), else_=1),
            func.similarity(Bill.title, term).desc(),
            Bill.last_action_date.desc().nulls_last(),
        )
    else:
        stmt = stmt.order_by(Bill.last_action_date.desc().nulls_last())
    bills = list(await db.scalars(stmt.offset(cursor).limit(limit + 1)))
    next_cursor = cursor + limit if len(bills) > limit else None
    return BillPage(items=await bills_out(db, user, bills[:limit]), next_cursor=next_cursor)


@router.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    return (await bills_out(db, user, [bill]))[0]


@router.get("/bills/{bill_id}/text", response_model=BillText)
async def get_bill_text(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    return BillText(full_text=bill.full_text, congress_url=bill.congress_url)


@router.post("/bills/{bill_id}/view", status_code=status.HTTP_204_NO_CONTENT)
async def record_view(bill_id: uuid.UUID, db: DB, redis: RedisDep, user: CurrentUser):
    """Opening a bill's detail page counts as a 'view' interaction, once per bill per day."""
    bill = await _published_bill(db, bill_id)
    if await redis.set(f"viewed:{user.id}:{bill.id}", "1", ex=86400, nx=True):
        interactions.record(db, user, bill, InteractionType.view)
        await db.commit()


@router.post("/bills/{bill_id}/vote", response_model=VoteOut)
async def vote(bill_id: uuid.UUID, body: VoteIn, db: DB, redis: RedisDep, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    await enforce_hourly_limit(redis, "vote", user.id, settings.votes_per_hour)
    # Lock the bill row so concurrent votes don't lose net_score updates.
    await db.refresh(bill, with_for_update=True)
    existing = await db.scalar(select(Vote).where(Vote.user_id == user.id, Vote.bill_id == bill.id))
    old = existing.value if existing else 0
    if body.value == 0:
        if existing:
            await db.delete(existing)
    elif existing:
        existing.value = body.value
    else:
        db.add(Vote(user_id=user.id, bill_id=bill.id, value=body.value))
    bill.net_score += body.value - old
    if body.value and body.value != old:
        interactions.record(db, user, bill, InteractionType.vote)
    await db.commit()
    return VoteOut(net_score=bill.net_score, my_vote=body.value)


@router.post("/bills/{bill_id}/report-summary", status_code=status.HTTP_204_NO_CONTENT)
async def report_summary(bill_id: uuid.UUID, body: SummaryReportIn, db: DB, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    db.add(SummaryReport(user_id=user.id, bill_id=bill.id, feedback=body.feedback))
    await db.commit()
