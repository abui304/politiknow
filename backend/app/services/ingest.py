"""Scheduled ingestion pipeline (spec 3.3):
poll -> dedupe -> fetch text -> summarize -> tag -> metadata -> store -> notify."""

import hashlib
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import timeline
from app.config import settings
from app.models import Bill, BillCosponsor, IngestState
from app.services import hashtags, legislators, llm, notify
from app.services.congress import CongressClient

log = logging.getLogger(__name__)
# Ingestion walks a fixed time window oldest-first and saves its position, so a run that
# hits the per-run cap resumes exactly where it stopped instead of skipping the rest.
WINDOW_FROM = "window_from"
WINDOW_TO = "window_to"
WINDOW_OFFSET = "window_offset"
LAST_DONE = "caught_up_through"  # everything updated before this has been ingested
ROSTER_SYNCED = "roster_synced_at"
ROSTER_REFRESH = timedelta(days=7)
# Congress.gov's order among same-day updates can shift slightly between requests, so a resumed
# run re-reads a few bills before its saved position. Re-reads are cheap: unchanged text is never
# re-summarized.
RESUME_OVERLAP = 10


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def _get_state(db: AsyncSession, key: str) -> str | None:
    row = await db.get(IngestState, key)
    return row.value if row else None


async def _set_state(db: AsyncSession, key: str, value: str) -> None:
    await db.merge(IngestState(key=key, value=value))


async def ingest_bill(
    db: AsyncSession,
    api: CongressClient,
    congress: int,
    bill_type: str,
    number: int,
    vocab: dict[str, str] | None = None,
) -> tuple[str, list[dict]]:
    """Ingests or refreshes one bill. Returns (outcome, push messages to send after commit).

    outcome: "new" (first published), "updated" (text changed and re-summarized),
    "refreshed" (metadata only), or "waiting" (no full text published yet).
    """
    bill_type = bill_type.upper()
    bill = await db.scalar(
        select(Bill).where(
            Bill.congress_number == congress, Bill.bill_type == bill_type, Bill.bill_number == number
        )
    )
    is_new = bill is None
    old_status = None if is_new else bill.status

    # Step 6 (metadata) first: it's cheap, and status changes matter even without new text.
    detail = await api.bill_detail(congress, bill_type, number)
    latest = detail.get("latestAction") or {}
    if is_new:
        bill = Bill(congress_number=congress, bill_type=bill_type, bill_number=number)
        db.add(bill)
    bill.title = detail.get("title") or bill.title or f"{bill_type} {number}"
    new_cosponsors = await legislators.sync_bill(db, api, bill, detail)
    bill.congress_url = detail.get("legislationUrl")
    if detail.get("introducedDate"):
        bill.introduced_date = date.fromisoformat(detail["introducedDate"])
    # Timeline: re-read the action list only when there's a new latest action.
    if latest.get("text") != bill.latest_action_text or not bill.milestones:
        bill.milestones = timeline.milestones(
            await api.actions(congress, bill_type, number), bill.introduced_date
        )
    bill.latest_action_text = latest.get("text")
    bill.status = timeline.status(bill_type, bill.milestones)
    bill.last_action_date = _parse_dt(latest.get("actionDate")) or _parse_dt(detail.get("updateDate"))

    # Step 3: full text. Bills often appear days before their text is published;
    # they stay unpublished and get picked up again on a later run.
    text_result = await api.latest_text(congress, bill_type, number)
    pushes: list[dict] = []
    outcome = "refreshed" if bill.is_published else "waiting"
    if text_result:
        _, text = text_result
        version_hash = hashlib.sha256(text.encode()).hexdigest()
        # Step 2: dedupe — only re-summarize when the text actually changed (spec 2.2).
        if version_hash != bill.version_hash:
            bill.full_text = text
            bill.summary_simple, bill.summary_detailed = await llm.summarize(bill.title, text)  # Step 4
            policy_area = (detail.get("policyArea") or {}).get("name")
            if vocab is None:
                vocab = await hashtags.vocabulary(db)
            tags = await llm.generate_tags(bill.title, text, policy_area, list(vocab.values()))  # Step 5
            bill.primary_tags, bill.sub_tags = tags.primary, hashtags.canonicalize(tags.sub, vocab)
            bill.version_hash = version_hash
            first_publish = not bill.is_published
            bill.is_published = True
            outcome = "new" if first_publish else "updated"
            await db.flush()
            if first_publish:
                pushes += await notify.notify_new_bill(db, bill)  # Step 8
                cosponsors = await db.scalars(select(BillCosponsor.bioguide_id).where(BillCosponsor.bill_id == bill.id))
                pushes += await notify.notify_legislator_bill(db, bill, bill.sponsor_id, set(cosponsors))

    if outcome in ("refreshed", "updated") and new_cosponsors:
        await db.flush()
        pushes += await notify.notify_legislator_bill(db, bill, None, new_cosponsors)

    if not is_new and bill.is_published and old_status != bill.status:
        await db.flush()
        pushes += await notify.notify_status_change(db, bill)
    return outcome, pushes


async def run_ingestion(db: AsyncSession, api: CongressClient | None = None) -> dict:
    api = api or CongressClient()
    now = datetime.now(UTC)
    fmt = "%Y-%m-%dT%H:%M:%SZ"

    # Resume an unfinished window, or open a new one from where the last window ended.
    window_from = await _get_state(db, WINDOW_FROM)
    window_to = await _get_state(db, WINDOW_TO)
    offset = int(await _get_state(db, WINDOW_OFFSET) or 0)
    if not (window_from and window_to):
        last_done = _parse_dt(await _get_state(db, LAST_DONE))
        window_from = (last_done or now - timedelta(days=settings.ingest_lookback_days)).strftime(fmt)
        window_to = now.strftime(fmt)
        offset = 0

    # Step 1: the next page of updated bills in this window.
    start = max(offset - RESUME_OVERLAP, 0)
    listed, total = await api.list_updated_bills(
        window_from, window_to, start, settings.ingest_max_bills_per_run + (offset - start)
    )
    targets = [(b["congress"], b["type"], int(b["number"])) for b in listed]

    # Also retry recent bills still waiting on their text.
    pending = await db.execute(
        select(Bill.congress_number, Bill.bill_type, Bill.bill_number)
        .where(Bill.is_published.is_(False), Bill.ingested_at >= now - timedelta(days=30))
        .limit(settings.ingest_max_bills_per_run)
    )
    seen = set(targets)
    targets += [tuple(row) for row in pending if tuple(row) not in seen]

    vocab = await hashtags.vocabulary(db)  # shared across the run so bills in it reuse each other's hashtags
    counts = {"new": 0, "updated": 0, "refreshed": 0, "waiting": 0, "failed": 0}
    pushes: list[dict] = []
    for congress, bill_type, number in targets:
        try:
            outcome, bill_pushes = await ingest_bill(db, api, int(congress), bill_type, int(number), vocab)
            await db.commit()
            counts[outcome] += 1
            pushes += bill_pushes
        except Exception:
            await db.rollback()
            counts["failed"] += 1
            log.exception("Failed to ingest %s %s-%s", congress, bill_type, number)

    # Who's serving now (for "your representatives"), weekly; it's two or three free calls.
    roster_synced = _parse_dt(await _get_state(db, ROSTER_SYNCED))
    if not roster_synced or now - roster_synced > ROSTER_REFRESH:
        try:
            counts["roster"] = await legislators.sync_roster(db, api)
            await _set_state(db, ROSTER_SYNCED, now.strftime(fmt))
            await db.commit()
        except Exception:
            await db.rollback()
            log.exception("Failed to sync the current-member roster")

    # New sponsors/cosponsors get their photo and office details (and older ones a monthly refresh).
    counts["members_synced"] = await legislators.sync_members(db, api, limit=settings.ingest_max_members_per_run)

    # Step 7: save our position. Once the window is exhausted, the next run starts where it ended.
    offset = start + len(listed)
    if offset >= total:
        await _set_state(db, LAST_DONE, window_to)
        await db.execute(delete(IngestState).where(IngestState.key.in_([WINDOW_FROM, WINDOW_TO, WINDOW_OFFSET])))
    else:
        await _set_state(db, WINDOW_FROM, window_from)
        await _set_state(db, WINDOW_TO, window_to)
        await _set_state(db, WINDOW_OFFSET, str(offset))
    await db.commit()
    await notify.send_pushes(pushes)

    result = {**counts, "backlog_remaining": max(total - offset, 0), "window": f"{window_from} -> {window_to}"}
    log.info("Ingestion done: %s", result)
    return result
