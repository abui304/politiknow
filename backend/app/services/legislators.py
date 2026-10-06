"""Sponsors and cosponsors (spec 3.3 step 6). Members are stored once in `legislators` and linked to
bills, so people can browse everything a member sponsored or cosponsored."""

import logging
import re
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bill, BillCosponsor, Legislator
from app.services.congress import CongressClient

log = logging.getLogger(__name__)
MEMBER_REFRESH_DAYS = 30

# Search filter values -> stored party codes. "ID" is an Independent who caucuses with Democrats.
PARTY_CODES = {"D": ["D"], "R": ["R"], "I": ["I", "ID"]}


def like_pattern(term: str) -> str:
    """A LIKE pattern matching `term` anywhere, with its own wildcards taken literally."""
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def name_matches(pattern: str):
    """Case-insensitive LIKE on "First Last" or Congress.gov's "Sen. Last, First [D-MA]" form."""
    first_last = func.concat(Legislator.first_name, " ", Legislator.last_name)
    return or_(Legislator.full_name.ilike(pattern, escape="\\"), first_last.ilike(pattern, escape="\\"))


def _row(member: dict) -> dict:
    full_name = member.get("fullName") or member["bioguideId"]
    district = member.get("district")
    return {
        "bioguide_id": member["bioguideId"],
        "full_name": full_name,
        "first_name": member.get("firstName"),
        "last_name": member.get("lastName"),
        "party": member.get("party"),
        "state": member.get("state"),
        "district": int(district) if district is not None else None,
        # Delegates and resident commissioners sit in the House too.
        "chamber": "senate" if full_name.startswith("Sen.") else "house",
    }


async def upsert(db: AsyncSession, members: list[dict]) -> None:
    rows = list({r["bioguide_id"]: r for r in map(_row, members)}.values())
    if not rows:
        return
    stmt = insert(Legislator).values(rows)
    await db.execute(stmt.on_conflict_do_update(
        index_elements=[Legislator.bioguide_id],
        set_={c: stmt.excluded[c] for c in rows[0] if c != "bioguide_id"},
    ))


async def sync_bill(db: AsyncSession, api: CongressClient, bill: Bill, detail: dict) -> None:
    """Records the bill's sponsor, and refetches its cosponsors when Congress.gov's count has changed."""
    sponsor = (detail.get("sponsors") or [{}])[0]
    if sponsor.get("bioguideId"):
        await upsert(db, [sponsor])
    bill.sponsor_id = sponsor.get("bioguideId")
    bill.sponsor_name = sponsor.get("fullName")
    bill.sponsor_party = sponsor.get("party")

    count = (detail.get("cosponsors") or {}).get("count", 0)
    if count == (bill.cosponsor_count or 0):
        return
    await db.flush()  # a new bill needs its id
    current = [
        m for m in await api.cosponsors(bill.congress_number, bill.bill_type, bill.bill_number)
        if m.get("bioguideId") and not m.get("sponsorshipWithdrawnDate")
    ]
    await upsert(db, current)
    await db.execute(delete(BillCosponsor).where(BillCosponsor.bill_id == bill.id))
    for m in {m["bioguideId"]: m for m in current}.values():
        db.add(BillCosponsor(
            bill_id=bill.id,
            bioguide_id=m["bioguideId"],
            is_original=bool(m.get("isOriginalCosponsor")),
            sponsorship_date=date.fromisoformat(m["sponsorshipDate"]) if m.get("sponsorshipDate") else None,
        ))
    bill.cosponsor_count = count


def career(terms: list[dict], current: bool) -> list[dict]:
    """Collapses per-Congress terms into continuous spans per chamber, oldest first.
    A current member's last span has end=None ("to now")."""
    spans: list[dict] = []
    for t in sorted(terms, key=lambda t: t.get("startYear") or 0):
        chamber = "senate" if t.get("chamber") == "Senate" else "house"
        start, end = t.get("startYear"), t.get("endYear")
        last = spans[-1] if spans else None
        # Back-to-back terms in the same chamber (one ends the year the next starts) form one span.
        if last and last["chamber"] == chamber and last["end"] and start and start <= last["end"]:
            last["end"] = end
        else:
            spans.append({"chamber": chamber, "start": start, "end": end})
    if current and spans:
        spans[-1]["end"] = None
    return spans


def office_address(info: dict) -> str | None:
    address = re.sub(r"\s+", " ", info.get("officeAddress") or "").strip()
    if not address:
        return None
    if "Washington" not in address:  # House addresses leave off the city
        # Congress.gov sometimes gives the Senate ZIP for House offices; every House building is 20515.
        zip_code = "20515" if "House Office Building" in address else info.get("zipCode") or ""
        address += f", Washington, DC {zip_code}".rstrip()
    return address


def apply_member(legislator: Legislator, member: dict) -> None:
    depiction = member.get("depiction") or {}
    info = member.get("addressInformation") or {}
    legislator.state_name = member.get("state")
    legislator.image_url = depiction.get("imageUrl")
    # Attribution comes as HTML, e.g. '<a href="...">Courtesy U.S. Senate Historical Office</a>'.
    legislator.image_credit = re.sub(r"<[^>]+>", "", depiction.get("attribution") or "").strip()[:255] or None
    legislator.career = career(member.get("terms") or [], bool(member.get("currentMember")))
    legislator.office_address = office_address(info)
    legislator.phone = info.get("phoneNumber")
    legislator.member_synced_at = datetime.now(UTC)


async def sync_members(db: AsyncSession, api: CongressClient, limit: int | None = None) -> int:
    """Refreshes photos, careers, and offices for members never synced or synced over 30 days ago,
    never-synced first. One free Congress.gov call each. Returns how many were updated."""
    stale = datetime.now(UTC) - timedelta(days=MEMBER_REFRESH_DAYS)
    due = list(await db.scalars(
        select(Legislator.bioguide_id)
        .where(or_(Legislator.member_synced_at.is_(None), Legislator.member_synced_at < stale))
        .order_by(Legislator.member_synced_at.nulls_first())
        .limit(limit)
    ))
    done = 0
    for bioguide_id in due:
        try:
            apply_member(await db.get(Legislator, bioguide_id), await api.member(bioguide_id))
            await db.commit()
            done += 1
        except Exception:
            await db.rollback()
            log.exception("Failed to sync member %s", bioguide_id)
    return done
