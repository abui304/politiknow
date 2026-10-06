"""Sponsors and cosponsors (spec 3.3 step 6). Members are stored once in `legislators` and linked to
bills, so people can browse everything a member sponsored or cosponsored."""

from datetime import date

from sqlalchemy import delete, func, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bill, BillCosponsor, Legislator
from app.services.congress import CongressClient

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
