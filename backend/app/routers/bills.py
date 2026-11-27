import asyncio
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import ARRAY, Text, case, delete, exists, func, literal_column, or_, select, tuple_

from app import search_terms
from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.links import congress_gov_url
from app.models import Bill, BillCosponsor, BillFollow, InteractionType, Legislator, SummaryReport, Vote, bill_label
from app.ratelimit import enforce_hourly_limit
from app.schemas import (
    BillOut,
    BillPage,
    BillRecordOut,
    BillText,
    HashtagOut,
    OfficialRelated,
    OpenRelatedIn,
    OpenRelatedOut,
    StageOut,
    SummaryReportIn,
    TagOut,
    VoteIn,
    VoteOut,
)
from app.serializers import bills_out
from app.services import feed as feed_service
from app.services import hashtags, ingest, interactions, notify
from app.services.congress import CongressClient
from app.services.legislators import PARTY_CODES, like_pattern, name_matches
from app.taxonomy import POLICY_AREAS
from app.topic_words import TOPIC_WORDS

log = logging.getLogger(__name__)

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
    # Cumulative: passed at least one chamber, wherever it went next.
    "passed": Bill.status.in_(("passed_house", "passed_senate", "to_president", "became_law", "vetoed")),
}
Stage = Literal["law", "president", "senate", "house", "committee", "vetoed", "passed"]

TS_CONFIG = literal_column("'english'::regconfig")
# Matches in a search snippet are wrapped in these control characters, which never occur in bill text.
MARK_START, MARK_END = "\x02", "\x03"
SNIPPET_OPTIONS = (
    f'MaxFragments=2, MaxWords=22, MinWords=10, FragmentDelimiter=" … ", StartSel={MARK_START}, StopSel={MARK_END}'
)
SNIPPET_TEXT_CHARS = 100_000  # ts_headline re-parses the text, so keep it to the start of long bills
# Passages that are only a bill's legal preamble say nothing useful; the card shows the summary instead.
BOILERPLATE = re.compile(r"short title|cited as|be it enacted|table of contents", re.I)


async def _published_bill(db, bill_id: uuid.UUID) -> Bill:
    bill = await db.get(Bill, bill_id)
    if not bill or not bill.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
    return bill


@router.get("/tags", response_model=list[TagOut])
async def list_tags(_: CurrentUser):
    return [TagOut(name=name, words=TOPIC_WORDS[name]) for name in POLICY_AREAS]


@router.get("/hashtags", response_model=list[HashtagOut])
async def popular_hashtags(db: DB, _: CurrentUser, limit: int = Query(30, le=100)):
    """Hashtags used on at least two bills, most common first."""
    return [HashtagOut(name=name, bill_count=n) for name, n in await hashtags.popular(db, limit)]


def _has_hashtag(condition):
    """True when any of the bill's hashtags satisfies `condition(hashtag_column)`."""
    tags = func.jsonb_array_elements_text(Bill.sub_tags).table_valued("value")
    return exists(select(1).select_from(tags).where(condition(tags.c.value)))


@dataclass
class BillFilters:
    """Search filters shared by /search and /stages (status is applied separately)."""

    q: str | None = Query(None, max_length=200)
    tag: str | None = None
    hashtag: str | None = Query(None, max_length=60)
    party: Literal["D", "R", "I"] | None = None
    chamber: Literal["house", "senate"] | None = None

    @property
    def term(self) -> str:
        return (self.q or "").strip().lstrip("#").strip()

    # Set by resolve_looseness() when the search, taken strictly, finds nothing.
    loose = False

    @property
    def tsquery(self):
        """The search words as a Postgres full-text query ("quoted phrases" and -excluded words work), widened
        with everyday synonyms ("climate" also finds "greenhouse gas"), and any-word when `loose`."""
        term = search_terms.loosen(self.term) if self.loose else self.term
        return func.websearch_to_tsquery(TS_CONFIG, search_terms.expand(term))

    def number_match(self):
        """Matches a bill number typed as the search ("H.R. 1037", "hr1037", "1037"), or nothing."""
        parsed = search_terms.bill_number(self.term)
        if not parsed:
            return None
        bill_type, number = parsed
        return (Bill.bill_number == number) & (Bill.bill_type == bill_type) if bill_type else Bill.bill_number == number

    def text_match(self):
        """Matches the words in the title, either summary, or the full text (stemmed, so "taxes" finds "tax")."""
        return Bill.search_vector.op("@@")(self.tsquery)

    def title_or_hashtag(self):
        """Matches `term` in the title or a hashtag; these rank above name matches."""
        pattern = like_pattern(self.term)
        return or_(Bill.title.ilike(pattern, escape="\\"), _has_hashtag(lambda h: h.ilike(pattern, escape="\\")))

    def conditions(self) -> list:
        conds = [Bill.is_published.is_(True)]
        if self.tag:
            if self.tag not in POLICY_AREAS:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown tag")
            conds.append(Bill.primary_tags.contains([self.tag]))
        if self.hashtag and hashtags.clean(self.hashtag):
            wanted = hashtags.clean(self.hashtag).lower()
            conds.append(_has_hashtag(lambda h: func.lower(h) == wanted))
        if self.party:
            conds.append(Bill.sponsor_party.in_(PARTY_CODES[self.party]))
        if self.chamber:
            conds.append(Bill.bill_type.startswith("H" if self.chamber == "house" else "S"))
        if self.term:
            pattern = like_pattern(self.term)
            named = select(Legislator.bioguide_id).where(name_matches(pattern))
            number = self.number_match()
            conds.append(or_(
                *([number] if number is not None else []),
                self.title_or_hashtag(),
                self.text_match(),
                Bill.sponsor_name.ilike(pattern, escape="\\"),
                Bill.sponsor_id.in_(named),
                Bill.id.in_(select(BillCosponsor.bill_id).where(BillCosponsor.bioguide_id.in_(named))),
            ))
        return conds


Filters = Annotated[BillFilters, Depends()]


async def resolve_looseness(db, filters: BillFilters) -> None:
    """Searches match every word by default. When that finds nothing (within the other filters), fall back to
    any word, so "student debt relief" still finds student loan bills instead of an empty page."""
    if not filters.term or len(filters.term.split()) < 2:
        return
    if not await db.scalar(select(exists().where(*filters.conditions()))):
        filters.loose = True


@router.get("/stages", response_model=list[StageOut])
async def stage_counts(db: DB, _: CurrentUser, filters: Filters):
    """How many published bills each status filter matches, within the other active filters."""
    await resolve_looseness(db, filters)
    row = (await db.execute(
        select(*(func.count().filter(cond) for cond in STAGES.values())).where(*filters.conditions())
    )).one()
    return [StageOut(key=key, bill_count=n) for key, n in zip(STAGES, row, strict=True)]


@router.get("/feed", response_model=BillPage)
async def get_feed(
    db: DB,
    redis: RedisDep,
    user: CurrentUser,
    background: BackgroundTasks,
    sort: Literal["for_you", "discussed"] = "for_you",
    cursor: int = 0,
    limit: int = Query(20, le=50),
):
    """"for_you": the personalized ranking. "discussed": most comments this week. Each bill says why it's here."""
    # Trending refreshes itself: the first feed read after it goes stale recalculates it in the background,
    # so no scheduler is needed for it. The Redis key makes sure only one request does.
    if settings.task_mode == "inline" and await redis.set(
        "trending:fresh", "1", ex=settings.trending_refresh_minutes * 60, nx=True
    ):
        from app.jobs import run_in_own_session

        background.add_task(run_in_own_session, "recalculate_trending")
    if sort == "discussed":
        bills, reasons, next_cursor = await feed_service.most_discussed(db, cursor, limit)
    else:
        bills, reasons, next_cursor = await feed_service.page(db, redis, user, cursor, limit)
    extra = {bill_id: {"reason": why} for bill_id, why in reasons.items()}
    return BillPage(items=await bills_out(db, user, bills, extra), next_cursor=next_cursor)


@router.get("/search", response_model=BillPage)
async def search(
    db: DB,
    user: CurrentUser,
    filters: Filters,
    stage: Stage | None = None,
    cursor: int = 0,
    limit: int = Query(20, le=50),
):
    """Filter by topic, hashtag (exact, case-insensitive), sponsor's party, chamber, and/or status, and/or
    match words in the title, any hashtag, either summary, the full text, or a sponsor's or cosponsor's
    name. Title and hashtag matches rank first, then the best full-text matches, then name matches.
    Bills matched by their summaries or text come with a `snippet` showing where."""
    await resolve_looseness(db, filters)
    stmt = select(Bill).where(*filters.conditions())
    if stage:
        stmt = stmt.where(STAGES[stage])
    if filters.term:
        number = filters.number_match()
        stmt = stmt.order_by(
            *([case((number, 0), else_=1)] if number is not None else []),  # an exact bill number first
            case((filters.title_or_hashtag(), 0), else_=1),
            func.ts_rank_cd(Bill.search_vector, filters.tsquery).desc(),
            func.similarity(Bill.title, filters.term).desc(),
            Bill.last_action_date.desc().nulls_last(),
        )
    else:
        stmt = stmt.order_by(Bill.last_action_date.desc().nulls_last())
    bills = list(await db.scalars(stmt.offset(cursor).limit(limit + 1)))
    next_cursor = cursor + limit if len(bills) > limit else None
    page = bills[:limit]
    extra = await _snippets(db, filters, [b.id for b in page]) if filters.term and page else {}
    return BillPage(items=await bills_out(db, user, page, extra), next_cursor=next_cursor)


async def _snippets(db, filters: BillFilters, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Passages from the summaries or full text where the search words appear, for bills that matched there."""
    body = (
        func.coalesce(Bill.summary_detailed, "") + " … "
        + func.left(func.coalesce(Bill.full_text, ""), SNIPPET_TEXT_CHARS)
    )
    rows = await db.execute(
        select(Bill.id, func.ts_headline(TS_CONFIG, body, filters.tsquery, SNIPPET_OPTIONS))
        # A bill whose title or hashtag matched already says why it's here; its card shows the summary instead.
        .where(Bill.id.in_(ids), filters.text_match(), ~filters.title_or_hashtag())
    )
    return {
        bill_id: {"snippet": " ".join(text.split())}
        for bill_id, text in rows if text and MARK_START in text and not BOILERPLATE.search(text)
    }


@router.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    return (await bills_out(db, user, [bill]))[0]


@router.get("/bills/{bill_id}/record", response_model=BillRecordOut)
async def bill_record(bill_id: uuid.UUID, db: DB, _: CurrentUser):
    """The official record around a bill: CBO cost estimates and the bills Congress links to it (identical
    companions, earlier versions, procedurally related), each linking into the app when we have it."""
    bill = await _published_bill(db, bill_id)
    rel = bill.official_related or []
    keys = {(r.get("congress"), r["type"], r["number"]) for r in rel}
    found = {}
    if keys:
        rows = await db.execute(select(Bill.congress_number, Bill.bill_type, Bill.bill_number, Bill.id).where(
            Bill.is_published.is_(True),
            tuple_(Bill.congress_number, Bill.bill_type, Bill.bill_number).in_(list(keys)),
        ))
        found = {(c, t, n): i for c, t, n, i in rows}
    related = [
        OfficialRelated(
            label=bill_label(r["type"], r["number"]), congress=r.get("congress"), type=r["type"], number=r["number"],
            title=r.get("title"),
            relationships=r.get("relationships") or [], latest=r.get("latest"),
            bill_id=found.get((r.get("congress"), r["type"], r["number"])),
            url=congress_gov_url(r.get("congress") or bill.congress_number, r["type"], r["number"]),
        )
        for r in rel
    ]
    # Identical companions first, then earlier Congresses, newest first.
    related.sort(key=lambda r: ("Identical bill" not in r.relationships, -(r.congress or 0)))
    return BillRecordOut(cbo_estimates=bill.cbo_estimates or [], related=related)


async def congress_api():
    api = CongressClient()
    try:
        yield api
    finally:
        await api.close()


@router.post("/bills/{bill_id}/record/open", response_model=OpenRelatedOut)
async def open_related(
    bill_id: uuid.UUID, body: OpenRelatedIn, db: DB, redis: RedisDep, user: CurrentUser,
    api: Annotated[CongressClient, Depends(congress_api)],
):
    """Opens a bill Congress links to this one, inside the app. If PolitiKNOW doesn't have it yet, it's fetched
    and summarized now, without alerts. Only bills on this bill's official list can be fetched this way."""
    bill = await _published_bill(db, bill_id)
    key = (body.congress, body.type.upper(), body.number)
    linked = {(r.get("congress") or bill.congress_number, r["type"], r["number"]) for r in bill.official_related or []}
    if key not in linked:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Congress doesn't link that bill to this one.")

    async def published() -> uuid.UUID | None:
        return await db.scalar(select(Bill.id).where(
            Bill.congress_number == key[0], Bill.bill_type == key[1], Bill.bill_number == key[2],
            Bill.is_published.is_(True),
        ))

    if found := await published():
        return OpenRelatedOut(bill_id=found)
    await enforce_hourly_limit(redis, "open_related", user.id, settings.open_related_per_hour)
    lock = f"open-related:{key[0]}-{key[1]}-{key[2]}"
    # Someone else is already fetching it: wait for theirs instead of paying twice.
    for _ in range(45):
        if await redis.set(lock, "1", nx=True, ex=120):
            break
        await asyncio.sleep(1)
        if found := await published():
            return OpenRelatedOut(bill_id=found)
    try:
        outcome, _ = await ingest.ingest_bill(db, api, *key, quiet=True)
        await db.commit()
    except Exception as e:
        await db.rollback()
        log.warning("Couldn't fetch linked bill %s: %s", key, e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't reach Congress.gov. Try again in a moment.") from e
    finally:
        await redis.delete(lock)
    if outcome == "waiting" or not (found := await published()):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Congress hasn't published this bill's text yet.")
    return OpenRelatedOut(bill_id=found)


@router.get("/bills/{bill_id}/related", response_model=list[BillOut])
async def related_bills(bill_id: uuid.UUID, db: DB, user: CurrentUser, limit: int = Query(4, le=10)):
    """Bills about the same thing: sharing the bill's specific subjects (its hidden keywords) counts most,
    then a similar title, within the same official topic. Replaces browsing by hashtag."""
    bill = await _published_bill(db, bill_id)
    keywords = [k.lower() for k in bill.sub_tags or []]
    shared = (
        select(func.count())
        .select_from(func.jsonb_array_elements_text(Bill.sub_tags).table_valued("value").alias("k"))
        .where(func.lower(literal_column("k.value")).in_(keywords))
        .scalar_subquery()
        if keywords else literal_column("0")
    )
    same_topic = Bill.primary_tags.op("?|")(func.cast(bill.primary_tags or [""], ARRAY(Text)))
    score = shared * 2 + func.similarity(Bill.title, bill.title) * 3
    stmt = (
        select(Bill)
        .where(Bill.is_published.is_(True), Bill.id != bill.id, or_(same_topic, shared > 0))
        .order_by(score.desc(), Bill.last_action_date.desc().nulls_last())
        .limit(limit)
    )
    return await bills_out(db, user, list(await db.scalars(stmt)))


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


@router.post("/bills/{bill_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_bill(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    """Alerts when the bill moves (status-change alerts), without voting or commenting."""
    bill = await _published_bill(db, bill_id)
    if not await db.get(BillFollow, (user.id, bill.id)):
        db.add(BillFollow(user_id=user.id, bill_id=bill.id))
        await notify.backfill_for_follow(db, user, bill)
        await db.commit()


@router.delete("/bills/{bill_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_bill(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    await db.execute(delete(BillFollow).where(BillFollow.user_id == user.id, BillFollow.bill_id == bill_id))
    await db.commit()


@router.post("/bills/{bill_id}/report-summary", status_code=status.HTTP_204_NO_CONTENT)
async def report_summary(bill_id: uuid.UUID, body: SummaryReportIn, db: DB, user: CurrentUser):
    bill = await _published_bill(db, bill_id)
    db.add(SummaryReport(user_id=user.id, bill_id=bill.id, feedback=body.feedback))
    await db.commit()
