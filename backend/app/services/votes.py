"""Recorded (roll-call) votes in the House and Senate: who voted how, on what.

House votes come from Congress.gov's house-vote API, which identifies members by Bioguide ID. The Senate has
no Congress.gov endpoint, so its votes come from senate.gov's public XML files, which identify senators by a
Senate-only ID; those are matched to our legislators by state and last name.

Everything shown is the official record, word for word: the question as the clerk wrote it, the result,
and each member's vote. Nothing here is generated or paraphrased.
"""

import logging
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, Legislator, LegislatorFollow, MemberVote, RollCall, User, bill_label
from app.schemas import LegislatorBase, MemberPosition, RollCallOut

log = logging.getLogger(__name__)
EASTERN = ZoneInfo("America/New_York")

SENATE_MENU = "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{c}_{s}.xml"
# senate.gov has served individual votes from both of these paths; the first that answers wins.
SENATE_VOTE_URLS = (
    "https://www.senate.gov/legislative/LIS/roll_call_votes/vote{c}{s}/vote_{c}_{s}_{n:05d}.xml",
    "https://www.senate.gov/general/v/legislative/LIS/roll_call_votes/vote{c}{s}/vote_{c}_{s}_{n:05d}.xml",
)
SENATE_PAGE = "https://www.senate.gov/legislative/LIS/roll_call_votes/vote{c}{s}/vote_{c}_{s}_{n:05d}.htm"

# Senate document names -> our bill type codes.
DOC_TYPES = {
    "S.": "S", "H.R.": "HR", "S.J.Res.": "SJRES", "H.J.Res.": "HJRES", "S.Res.": "SRES", "H.Res.": "HRES",
    "S.Con.Res.": "SCONRES", "H.Con.Res.": "HCONRES",
}
POSITIONS = {"yea": "Yea", "aye": "Yea", "yes": "Yea", "nay": "Nay", "no": "Nay", "present": "Present",
             "not voting": "Not Voting"}

# Most new votes fetched per chamber per run (each House vote is 2-3 API calls); a backlog is worked
# through over several runs, newest first.
MAX_NEW_PER_RUN = 60


def classify(question: str) -> str:
    """passage / cloture / amendment / nomination / procedural / other, from the official question."""
    q = question.lower()
    if "cloture" in q:
        return "cloture"
    if "nomination" in q or "confirmation" in q:
        return "nomination"
    if any(w in q for w in ("recommit", "table", "previous question", "reconsider", "motion to proceed",
                            "quorum", "adjourn", "point of order", "waive", "instruct", "journal")):
        return "procedural"
    if "amendment" in q and "concur" not in q:
        return "amendment"
    if any(w in q for w in ("passage", "pass", "agree", "concur", "conference report", "override", "objections",
                            "joint resolution", "resolution")):
        return "passage"
    return "other"


def position(cast: str | None) -> str:
    return POSITIONS.get((cast or "").strip().lower(), (cast or "Not Voting").strip() or "Not Voting")


def current_session(today: datetime | None = None) -> int:
    """Each Congress has two sessions: odd years are the 1st, even years the 2nd."""
    year = (today or datetime.now(UTC)).year
    return 1 if year % 2 else 2


async def _bill_id(db: AsyncSession, congress: int, bill_type: str | None, number) -> object | None:
    if not bill_type or not number:
        return None
    try:
        n = int(str(number).strip())
    except ValueError:
        return None
    return await db.scalar(select(Bill.id).where(
        Bill.congress_number == congress, Bill.bill_type == bill_type.upper(), Bill.bill_number == n
    ))


async def _known(db: AsyncSession, chamber: str, congress: int, session: int) -> set[int]:
    return set(await db.scalars(select(RollCall.number).where(
        RollCall.chamber == chamber, RollCall.congress == congress, RollCall.session == session
    )))


def _totals(members: list[tuple[str, str, str]]) -> dict:
    """{"D": {"yea": n, "nay": n, "present": n, "not_voting": n}, ...} from (bioguide, party, position)."""
    out: dict[str, dict[str, int]] = {}
    key = {"Yea": "yea", "Nay": "nay", "Present": "present"}
    for _, party, pos in members:
        p = out.setdefault((party or "?")[:2].upper(), {"yea": 0, "nay": 0, "present": 0, "not_voting": 0})
        p[key.get(pos, "not_voting")] += 1
    return out


def _store(db: AsyncSession, rc: RollCall, members: list[tuple[str, str, str]]) -> RollCall:
    totals = _totals(members)
    rc.party_totals = totals
    rc.yea = sum(t["yea"] for t in totals.values())
    rc.nay = sum(t["nay"] for t in totals.values())
    rc.present = sum(t["present"] for t in totals.values())
    rc.not_voting = sum(t["not_voting"] for t in totals.values())
    db.add(rc)
    seen: set[str] = set()
    for bioguide, _, pos in members:
        if bioguide and bioguide not in seen:
            seen.add(bioguide)
            db.add(MemberVote(roll_call=rc, bioguide_id=bioguide, position=pos))
    return rc


async def sync_house(db: AsyncSession, api, congress: int, session: int) -> list[RollCall]:
    known = await _known(db, "house", congress, session)
    listed = await api.house_votes(congress, session)
    new = sorted({int(v["rollCallNumber"]) for v in listed if v.get("rollCallNumber")} - known, reverse=True)
    added: list[RollCall] = []
    for number in new[:MAX_NEW_PER_RUN]:
        try:
            detail = await api.house_vote(congress, session, number)
            members = await api.house_vote_members(congress, session, number)
        except Exception as e:  # one bad vote shouldn't stop the rest
            log.warning("House vote %s-%s-%s failed: %s", congress, session, number, e)
            continue
        question = detail.get("voteQuestion") or detail.get("question") or "Recorded vote"
        if detail.get("amendmentAuthor"):
            question = f"{question} ({detail['amendmentAuthor']})"
        label = None
        if detail.get("legislationType") and detail.get("legislationNumber"):
            label = bill_label(detail["legislationType"].upper(), int(detail["legislationNumber"]))
        rc = RollCall(
            chamber="house", congress=congress, session=session, number=number,
            voted_at=datetime.fromisoformat(detail["startDate"]).astimezone(UTC) if detail.get("startDate")
            else datetime.now(UTC),
            question=question, kind=classify(question), result=detail.get("result") or "",
            bill_id=await _bill_id(db, congress, detail.get("legislationType"), detail.get("legislationNumber")),
            measure=label, source_url=detail.get("sourceDataURL"),
        )
        rows = [(m.get("bioguideID") or m.get("bioguideId"), m.get("voteParty"), position(m.get("voteCast")))
                for m in members]
        added.append(_store(db, rc, rows))
    await db.flush()
    return added


def _text(el: ET.Element | None, tag: str) -> str:
    found = el.find(tag) if el is not None else None
    return (found.text or "").strip() if found is not None and found.text else ""


def _senate_date(raw: str) -> datetime:
    """"January 9, 2025,  05:40 PM" (Eastern) -> UTC."""
    cleaned = re.sub(r"\s+", " ", raw.replace(",", " ")).strip()
    for fmt in ("%B %d %Y %I:%M %p", "%B %d %Y"):
        try:
            return datetime.strptime(cleaned, fmt).replace(tzinfo=EASTERN).astimezone(UTC)
        except ValueError:
            continue
    return datetime.now(UTC)


async def _senator_ids(db: AsyncSession) -> dict[tuple[str, str], str]:
    """(state, last name) -> Bioguide ID for senators we know, for matching senate.gov's member lists."""
    rows = await db.execute(select(Legislator.state, Legislator.last_name, Legislator.bioguide_id).where(
        Legislator.chamber == "senate"
    ))
    return {(state, (last or "").lower()): bid for state, last, bid in rows if state and last}


def parse_senate_vote(xml: str, senators: dict[tuple[str, str], str]) -> tuple[dict, list[tuple[str, str, str]]]:
    root = ET.fromstring(xml)
    doc = root.find("document")
    info = {
        "question": _text(root, "vote_question_text") or _text(root, "question") or "Recorded vote",
        "result": _text(root, "vote_result_text") or _text(root, "vote_result"),
        "voted_at": _senate_date(_text(root, "vote_date")),
        "doc_type": DOC_TYPES.get(_text(doc, "document_type")),
        "doc_number": _text(doc, "document_number"),
        "measure": _text(doc, "document_name") or None,
    }
    members: list[tuple[str, str, str]] = []
    unmatched = 0
    for m in root.iter("member"):
        bid = senators.get((_text(m, "state"), _text(m, "last_name").lower()))
        if not bid:
            unmatched += 1
            continue
        members.append((bid, _text(m, "party"), position(_text(m, "vote_cast"))))
    if unmatched:
        log.info("Senate vote: %s senators not matched to a legislator record", unmatched)
    return info, members


async def sync_senate(db: AsyncSession, api, congress: int, session: int) -> list[RollCall]:
    known = await _known(db, "senate", congress, session)
    menu = ET.fromstring(await api.senate_xml(SENATE_MENU.format(c=congress, s=session)))
    numbers = {int(_text(v, "vote_number")) for v in menu.iter("vote") if _text(v, "vote_number").isdigit()}
    new = sorted(numbers - known, reverse=True)
    senators = await _senator_ids(db)
    added: list[RollCall] = []
    for number in new[:MAX_NEW_PER_RUN]:
        xml = None
        for pattern in SENATE_VOTE_URLS:
            try:
                xml = await api.senate_xml(pattern.format(c=congress, s=session, n=number))
                break
            except Exception as e:
                log.info("Senate vote %s-%s-%s not at %s: %s", congress, session, number, pattern, e)
        if not xml:
            continue
        try:
            info, members = parse_senate_vote(xml, senators)
        except ET.ParseError as e:
            log.warning("Senate vote %s-%s-%s unreadable: %s", congress, session, number, e)
            continue
        rc = RollCall(
            chamber="senate", congress=congress, session=session, number=number, voted_at=info["voted_at"],
            question=info["question"], kind=classify(info["question"]), result=info["result"],
            bill_id=await _bill_id(db, congress, info["doc_type"], info["doc_number"]),
            measure=info["measure"], source_url=SENATE_PAGE.format(c=congress, s=session, n=number),
        )
        added.append(_store(db, rc, members))
    await db.flush()
    return added


async def _notes(db: AsyncSession, user: User) -> dict[str, str]:
    """bioguide -> how this member relates to the user."""
    notes: dict[str, str] = {}
    for bid in await db.scalars(select(LegislatorFollow.bioguide_id).where(LegislatorFollow.user_id == user.id)):
        notes[bid] = "You follow"
    if user.home_state:
        for leg in await db.scalars(select(Legislator).where(
            Legislator.in_office.is_(True), Legislator.state == user.home_state
        )):
            if leg.chamber == "senate":
                notes[leg.bioguide_id] = "Your senator"
            elif leg.district == user.home_district:
                notes[leg.bioguide_id] = "Your representative"
    return notes


async def with_members(db: AsyncSession, user: User, rcs: list[RollCall]) -> list[RollCallOut]:
    notes = await _notes(db, user)
    outs = [RollCallOut.model_validate(rc) for rc in rcs]
    bill_ids = {rc.bill_id for rc in rcs if rc.bill_id}
    published = set(await db.scalars(
        select(Bill.id).where(Bill.id.in_(bill_ids), Bill.is_published.is_(True))
    )) if bill_ids else set()
    for out in outs:
        if out.bill_id not in published:
            out.bill_id = None
    if not notes or not rcs:
        return outs
    rows = await db.execute(
        select(MemberVote.roll_call_id, MemberVote.position, Legislator)
        .join(Legislator, Legislator.bioguide_id == MemberVote.bioguide_id)
        .where(MemberVote.roll_call_id.in_([rc.id for rc in rcs]), MemberVote.bioguide_id.in_(list(notes)))
    )
    by_rc: dict[uuid.UUID, list[MemberPosition]] = {}
    for rc_id, pos, leg in rows:
        base = LegislatorBase.model_validate(leg).model_dump()
        by_rc.setdefault(rc_id, []).append(MemberPosition(**base, position=pos, note=notes[leg.bioguide_id]))
    order = {"Your representative": 0, "Your senator": 1, "You follow": 2}
    for out in outs:
        out.your_members = sorted(by_rc.get(out.id, []), key=lambda m: (order.get(m.note, 3), m.name))
    return outs


LABEL_TYPES = {"H.R.": "HR", "S.": "S", "H.J.Res.": "HJRES", "S.J.Res.": "SJRES", "H.Res.": "HRES",
               "S.Res.": "SRES", "H.Con.Res.": "HCONRES", "S.Con.Res.": "SCONRES"}


async def relink(db: AsyncSession, congress: int) -> int:
    """Votes on a bill we hadn't ingested yet get linked once the bill arrives."""
    linked = 0
    for rc in await db.scalars(select(RollCall).where(
        RollCall.congress == congress, RollCall.bill_id.is_(None), RollCall.measure.is_not(None)
    )):
        prefix, _, number = (rc.measure or "").rpartition(" ")
        if prefix in LABEL_TYPES and number.isdigit():
            rc.bill_id = await _bill_id(db, congress, LABEL_TYPES[prefix], number)
            linked += bool(rc.bill_id)
    await db.flush()
    return linked


async def sync_votes(db: AsyncSession, api, congress: int | None = None, session: int | None = None) -> dict:
    """Fetches recorded votes not stored yet, for both chambers, then alerts followers. One chamber failing
    (senate.gov down, say) doesn't stop the other."""
    from app.services import notify

    congress = congress or settings.congress_number
    session = session or current_session()
    added: list[RollCall] = []
    for chamber, fn in (("house", sync_house), ("senate", sync_senate)):
        try:
            added += await fn(db, api, congress, session)
        except Exception as e:
            log.warning("Syncing %s votes failed: %s", chamber, e)
    await relink(db, congress)
    pushes = await notify.notify_member_votes(db, added)
    await db.commit()
    await notify.send_pushes(pushes)
    return {"house": sum(r.chamber == "house" for r in added), "senate": sum(r.chamber == "senate" for r in added)}
