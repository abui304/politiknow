"""Scheduled ingestion pipeline (spec 3.3):
poll -> dedupe -> fetch text -> summarize -> tag -> metadata -> store -> notify."""

import hashlib
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, IngestState
from app.services import llm, notify
from app.services.congress import CongressClient, status_from_action

log = logging.getLogger(__name__)
LAST_POLL_KEY = "last_successful_poll"


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


async def ingest_bill(db: AsyncSession, api: CongressClient, congress: int, bill_type: str, number: int) -> list[dict]:
    """Ingests or refreshes one bill. Returns push messages to send after commit."""
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
    sponsor = (detail.get("sponsors") or [{}])[0]
    latest = detail.get("latestAction") or {}
    if is_new:
        bill = Bill(congress_number=congress, bill_type=bill_type, bill_number=number)
        db.add(bill)
    bill.title = detail.get("title") or bill.title or f"{bill_type} {number}"
    bill.sponsor_id = sponsor.get("bioguideId")
    bill.sponsor_name = sponsor.get("fullName")
    bill.sponsor_party = sponsor.get("party")
    bill.latest_action_text = latest.get("text")
    bill.status = status_from_action(latest.get("text"))
    bill.congress_url = detail.get("legislationUrl")
    if detail.get("introducedDate"):
        bill.introduced_date = date.fromisoformat(detail["introducedDate"])
    bill.last_action_date = _parse_dt(latest.get("actionDate")) or _parse_dt(detail.get("updateDate"))

    # Step 3: full text. Bills often appear days before their text is published;
    # they stay unpublished and get picked up again on a later run.
    text_result = await api.latest_text(congress, bill_type, number)
    pushes: list[dict] = []
    if text_result:
        _, text = text_result
        version_hash = hashlib.sha256(text.encode()).hexdigest()
        # Step 2: dedupe — only re-summarize when the text actually changed (spec 2.2).
        if version_hash != bill.version_hash:
            bill.full_text = text
            bill.summary_simple, bill.summary_detailed = await llm.summarize(bill.title, text)  # Step 4
            policy_area = (detail.get("policyArea") or {}).get("name")
            tags = await llm.generate_tags(bill.title, text, policy_area)  # Step 5
            bill.primary_tags, bill.sub_tags = tags.primary, tags.sub
            bill.version_hash = version_hash
            first_publish = not bill.is_published
            bill.is_published = True
            await db.flush()
            if first_publish:
                pushes += await notify.notify_new_bill(db, bill)  # Step 8

    if not is_new and bill.is_published and old_status != bill.status:
        await db.flush()
        pushes += await notify.notify_status_change(db, bill)
    return pushes


async def run_ingestion(db: AsyncSession, api: CongressClient | None = None) -> dict:
    api = api or CongressClient()
    started = datetime.now(UTC)
    last = await _get_state(db, LAST_POLL_KEY)
    since = _parse_dt(last) or started - timedelta(days=settings.ingest_lookback_days)

    # Step 1: poll for new/updated bills.
    listed = await api.list_updated_bills(since.strftime("%Y-%m-%dT%H:%M:%SZ"), settings.ingest_max_bills_per_run)
    targets = {(b["congress"], b["type"], int(b["number"])) for b in listed}

    # Also retry recent bills still waiting on their text.
    pending = await db.execute(
        select(Bill.congress_number, Bill.bill_type, Bill.bill_number)
        .where(Bill.is_published.is_(False), Bill.ingested_at >= started - timedelta(days=30))
        .limit(settings.ingest_max_bills_per_run)
    )
    targets |= {tuple(row) for row in pending}

    ok = failed = 0
    pushes: list[dict] = []
    for congress, bill_type, number in targets:
        try:
            pushes += await ingest_bill(db, api, int(congress), bill_type, int(number))
            await db.commit()
            ok += 1
        except Exception:
            await db.rollback()
            failed += 1
            log.exception("Failed to ingest %s %s-%s", congress, bill_type, number)

    # Step 7: store the poll timestamp only after a pass that didn't wholesale fail.
    if ok or not targets:
        await _set_state(db, LAST_POLL_KEY, started.isoformat())
        await db.commit()
    await notify.send_pushes(pushes)
    log.info("Ingestion done: %s ok, %s failed", ok, failed)
    return {"ok": ok, "failed": failed}
