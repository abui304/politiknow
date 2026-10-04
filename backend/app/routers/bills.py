import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.models import Bill, InteractionType, SummaryReport, Vote
from app.ratelimit import enforce_hourly_limit
from app.schemas import BillOut, BillPage, BillText, SummaryReportIn, TagOut, VoteIn, VoteOut
from app.serializers import bills_out
from app.services import feed as feed_service
from app.services import interactions
from app.taxonomy import POLICY_AREAS

router = APIRouter(tags=["bills"])


async def _published_bill(db, bill_id: uuid.UUID) -> Bill:
    bill = await db.get(Bill, bill_id)
    if not bill or not bill.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
    return bill


@router.get("/tags", response_model=list[TagOut])
async def list_tags(_: CurrentUser):
    return [TagOut(name=name) for name in POLICY_AREAS]


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
    cursor: int = 0,
    limit: int = Query(20, le=50),
):
    """Phase 1 basic search: filter by primary tag and/or match words in the title."""
    stmt = select(Bill).where(Bill.is_published.is_(True))
    if tag:
        if tag not in POLICY_AREAS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown tag")
        stmt = stmt.where(Bill.primary_tags.contains([tag]))
    if q and q.strip():
        term = q.strip()
        like = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Bill.title.ilike(f"%{like}%", escape="\\")).order_by(
            func.similarity(Bill.title, term).desc(), Bill.last_action_date.desc().nulls_last()
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
