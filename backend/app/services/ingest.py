"""Scheduled ingestion pipeline (spec 3.3):
poll -> dedupe -> fetch text -> summarize -> tag -> metadata -> store -> notify."""

import hashlib
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import timeline
from app.config import settings
from app.models import Bill, BillCosponsor, IngestState
from app.services import blurhash, floor, hashtags, legislators, llm, notify, votes
from app.services.congress import CongressClient

log = logging.getLogger(__name__)
# Ingestion walks a fixed time window oldest-first and saves its position, so a run that
# hits the per-run cap resumes exactly where it stopped instead of skipping the rest.
WINDOW_FROM = "window_from"
WINDOW_TO = "window_to"
WINDOW_OFFSET = "window_offset"
LAST_DONE = "caught_up_through"  # everything updated before this has been ingested
ROSTER_SYNCED = "roster_synced_at"
# Only one ingestion runs at a time (e.g. the worker's scheduled run and a manual `cli ingest`), or
# both insert the same new bills and pay to summarize them twice. The lock is a row rather than a
# Postgres advisory lock so it also works behind transaction-mode poolers (Supabase, PgBouncer).
# A run that crashes without releasing it is taken over once the lock is older than LOCK_STALE.
RUNNING_SINCE = "running_since"
LOCK_STALE = timedelta(hours=3)
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


def _estimates(detail: dict) -> list[dict]:
    return [
        {"title": e.get("title"), "description": e.get("description"), "url": e.get("url"),
         "date": (e.get("pubDate") or "")[:10] or None}
        for e in detail.get("cboCostEstimates") or [] if e.get("url")
    ]


def _related(items: list[dict]) -> list[dict]:
    out = []
    for r in items[:20]:
        if not (r.get("type") and r.get("number")):
            continue
        rels = [d.get("type") for d in (r.get("relationshipDetails") or []) if d.get("type")]
        out.append({
            "congress": r.get("congress"), "type": str(r["type"]).upper(), "number": int(r["number"]),
            "title": r.get("title"), "relationships": rels,
            "latest": (r.get("latestAction") or {}).get("text"),
        })
    return out


async def ingest_bill(
    db: AsyncSession,
    api: CongressClient,
    congress: int,
    bill_type: str,
    number: int,
    vocab: dict[str, str] | None = None,
    quiet: bool = False,
) -> tuple[str, list[dict]]:
    """Ingests or refreshes one bill. Returns (outcome, push messages to send after commit).

    outcome: "new" (first published), "updated" (text changed and re-summarized),
    "refreshed" (metadata only), or "waiting" (no full text published yet).
    quiet: no alerts. Bills from earlier Congresses are always quiet: they're history, not news.
    """
    quiet = quiet or congress != settings.congress_number
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
    # Official cost estimates come with the bill record, at no extra cost.
    bill.cbo_estimates = _estimates(detail)
    # Timeline and related bills: re-read only when there's a new latest action.
    action_changed = latest.get("text") != bill.latest_action_text or not bill.milestones
    if action_changed:
        bill.milestones = timeline.milestones(
            await api.actions(congress, bill_type, number), bill.introduced_date
        )
    if action_changed and (detail.get("relatedBills") or {}).get("count"):
        try:
            bill.official_related = _related(await api.related_bills(congress, bill_type, number))
        except Exception as e:  # nice to have; never blocks the bill
            log.info("Related bills for %s %s-%s unavailable: %s", congress, bill_type, number, e)
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
            if first_publish and not quiet:
                pushes += await notify.notify_new_bill(db, bill)  # Step 8
                cosponsors = await db.scalars(select(BillCosponsor.bioguide_id).where(BillCosponsor.bill_id == bill.id))
                pushes += await notify.notify_legislator_bill(db, bill, bill.sponsor_id, set(cosponsors))

    if quiet:
        return outcome, pushes
    if outcome in ("refreshed", "updated") and new_cosponsors:
        await db.flush()
        pushes += await notify.notify_legislator_bill(db, bill, None, new_cosponsors)

    if not is_new and bill.is_published and old_status != bill.status:
        await db.flush()
        pushes += await notify.notify_status_change(db, bill)
    return outcome, pushes


async def _floor_targets(db: AsyncSession) -> list[tuple[int, str, int]]:
    """Bills on this week's floor schedule that PolitiKNOW doesn't have yet. They're about to be voted on, so
    they're worth a summary even if Congress.gov's update list hasn't reached them."""
    if not settings.ingest_floor_bills:
        return []
    from app.redis_client import redis

    try:
        week = await floor.this_week(redis)
    except Exception:
        log.exception("Couldn't read the floor schedule")
        return []
    keys = {
        key for chamber in ("house", "senate") for item in week.get(chamber, [])
        for label in item.get("bills", []) if (key := floor.bill_key(label))
    }
    if not keys:
        return []
    have = set(await db.execute(
        select(Bill.bill_type, Bill.bill_number).where(
            Bill.congress_number == settings.congress_number,
            tuple_(Bill.bill_type, Bill.bill_number).in_(list(keys)),
        )
    ))
    missing = sorted(k for k in keys if tuple(k) not in {tuple(h) for h in have})
    return [(settings.congress_number, t, n) for t, n in missing[: settings.ingest_max_bills_per_run]]


async def _acquire_lock(db: AsyncSession, now: str, stale_before: str) -> bool:
    stmt = insert(IngestState).values(key=RUNNING_SINCE, value=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=[IngestState.key], set_={"value": now}, where=IngestState.value < stale_before
    ).returning(IngestState.key)
    acquired = (await db.execute(stmt)).first() is not None
    await db.commit()
    return acquired


async def run_ingestion(db: AsyncSession, api: CongressClient | None = None) -> dict:
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    now = datetime.now(UTC)
    token = now.strftime(fmt)
    if not await _acquire_lock(db, token, (now - LOCK_STALE).strftime(fmt)):
        log.info("Ingestion already running; skipping this run")
        return {"skipped": "ingestion already running"}
    try:
        return await _run_ingestion(db, api or CongressClient(), now, fmt)
    finally:
        await db.rollback()
        await db.execute(delete(IngestState).where(IngestState.key == RUNNING_SINCE, IngestState.value == token))
        await db.commit()


async def _run_ingestion(db: AsyncSession, api: CongressClient, now: datetime, fmt: str) -> dict:

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
    seen = set(targets)
    targets += [t for t in await _floor_targets(db) if t not in seen]

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
    # Their photos get a BlurHash placeholder (one free image download each).
    try:
        counts["blurhashes"] = await blurhash.backfill(db, limit=settings.ingest_max_members_per_run)
    except Exception:
        await db.rollback()
        log.exception("Failed to compute photo placeholders")

    # Recorded House and Senate votes since the last run (and "how your members voted" alerts).
    try:
        counts["votes"] = await votes.sync_votes(db, api)
    except Exception:
        await db.rollback()
        log.exception("Failed to sync recorded votes")

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


async def record_backfill(db: AsyncSession, api: CongressClient) -> int:
    """CBO cost estimates and official related bills for every published bill (two free calls each)."""
    done = 0
    for bill in list(await db.scalars(select(Bill).where(Bill.is_published.is_(True)))):
        try:
            detail = await api.bill_detail(bill.congress_number, bill.bill_type, bill.bill_number)
            bill.cbo_estimates = _estimates(detail)
            if (detail.get("relatedBills") or {}).get("count"):
                bill.official_related = _related(
                    await api.related_bills(bill.congress_number, bill.bill_type, bill.bill_number)
                )
            await db.commit()
            done += 1
        except Exception as e:
            await db.rollback()
            log.warning("Record backfill failed for %s: %s", bill.label, e)
    return done
