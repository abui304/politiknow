"""The weekly recap, "Your week in Congress": built from data already stored, by fixed rules, with no AI.

What goes in, in this order (the same rules for everyone, published on the About page):
1. Bills you follow that moved this week.
2. How your members voted on final passage and cloture this week.
3. What Congress passed this week: bills that passed a chamber or became law, most-followed first.
4. Coming up: bills on this week's floor schedule that you follow, are about your topics, or that your members
   sponsored or cosponsored. The full schedule lives on the calendar, so it isn't repeated here.
Every section is capped, so the recap is short and ends.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Text, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app import explain
from app.config import settings
from app.models import Bill, BillCosponsor, BillFollow, MemberVote, RollCall, User
from app.services import floor
from app.services.notify import ALERT_VOTE_KINDS, followed_tags, members_of
from app.services.votes import with_members

MAX_FOLLOWED = 6
MAX_VOTES = 6
MAX_PASSED = 6
MAX_COMING_UP = 6
PASSING_STAGES = ("passed_house", "passed_senate", "became_law")


def week_bounds(day: date) -> tuple[date, date]:
    """Monday to the following Monday."""
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=7)


@dataclass
class Digest:
    week_start: date
    followed: list[tuple[Bill, str]] = field(default_factory=list)  # (bill, what happened)
    votes: list = field(default_factory=list)  # RollCallOut with your_members
    passed: list[tuple[Bill, str]] = field(default_factory=list)
    coming_up: list[tuple[Bill, str]] = field(default_factory=list)
    floor_count: int = 0  # bills on this week's schedule in all
    # Sponsor party of every bill picked by rules 1 and 3, as a neutrality check (logged, not shown).
    party_mix: dict[str, int] = field(default_factory=dict)

    @property
    def is_empty(self) -> bool:
        return not (self.followed or self.votes or self.passed or self.coming_up)


def _stage_this_week(bill: Bill, start: date, end: date) -> str | None:
    """The furthest milestone the bill reached in the week, if any."""
    reached = [
        s for s, day in (bill.milestones or {}).items()
        if day and start.isoformat() <= day < end.isoformat()
    ]
    order = ["introduced", "in_committee", "passed_house", "passed_senate", "to_president", "vetoed", "became_law"]
    return max(reached, key=order.index) if reached else None


async def build(db: AsyncSession, user: User, day: date | None = None, floor_week: dict | None = None) -> Digest:
    start, end = week_bounds(day or datetime.now(UTC).date())
    start_dt = datetime.combine(start, datetime.min.time(), UTC)
    end_dt = datetime.combine(end, datetime.min.time(), UTC)
    digest = Digest(week_start=start)

    # 1. Bills you follow that moved.
    followed = list(await db.scalars(
        select(Bill).join(BillFollow, BillFollow.bill_id == Bill.id)
        .where(
            BillFollow.user_id == user.id, Bill.is_published.is_(True),
            Bill.last_action_date >= start_dt, Bill.last_action_date < end_dt,
        )
        .order_by(Bill.last_action_date.desc()).limit(MAX_FOLLOWED)
    ))
    for bill in followed:
        stage = _stage_this_week(bill, start, end)
        what = explain.stage_label(bill.bill_type, stage) if stage else (bill.latest_action_text or "New action")
        digest.followed.append((bill, what))
    seen = {b.id for b, _ in digest.followed}

    # 2. How your members voted (final passage and cloture).
    ids = await members_of(db, user)
    if ids:
        rcs = list(await db.scalars(
            select(RollCall).where(
                RollCall.kind.in_(ALERT_VOTE_KINDS), RollCall.voted_at >= start_dt, RollCall.voted_at < end_dt,
                RollCall.id.in_(select(MemberVote.roll_call_id).where(MemberVote.bioguide_id.in_(ids))),
            ).order_by(RollCall.voted_at.desc()).limit(MAX_VOTES)
        ))
        digest.votes = await with_members(db, user, rcs)

    # 3. What Congress passed: a chamber passage or a new law this week, most-followed first.
    in_week = [
        Bill.milestones[stage].astext.between(start.isoformat(), (end - timedelta(days=1)).isoformat())
        for stage in PASSING_STAGES
    ]
    followers = (
        select(func.count()).select_from(BillFollow).where(BillFollow.bill_id == Bill.id).scalar_subquery()
    )
    for bill in await db.scalars(
        select(Bill).where(Bill.is_published.is_(True), or_(*in_week))
        .order_by(followers.desc(), Bill.last_action_date.desc()).limit(MAX_PASSED + len(seen))
    ):
        if bill.id in seen or len(digest.passed) >= MAX_PASSED:
            continue
        stage = _stage_this_week(bill, start, end) or bill.status
        digest.passed.append((bill, explain.stage_label(bill.bill_type, stage)))

    # 4. Coming up: scheduled bills that are yours. The rest of the schedule is on the calendar.
    if floor_week:
        chamber_of: dict[tuple[str, int], str] = {}
        for chamber in ("house", "senate"):
            for item in floor_week.get(chamber, []):
                for label in item.get("bills", []):
                    if key := floor.bill_key(label):
                        chamber_of.setdefault(key, chamber)
        digest.floor_count = len(chamber_of)
        if chamber_of:
            topics = list(followed_tags(user))
            mine = [
                Bill.id.in_(select(BillFollow.bill_id).where(BillFollow.user_id == user.id)),
            ]
            if topics:
                mine.append(Bill.primary_tags.op("?|")(func.cast(topics, ARRAY(Text))))
            if ids:
                mine.append(Bill.sponsor_id.in_(ids))
                mine.append(Bill.id.in_(select(BillCosponsor.bill_id).where(BillCosponsor.bioguide_id.in_(ids))))
            seen |= {b.id for b, _ in digest.passed}
            for bill in await db.scalars(
                select(Bill).where(
                    Bill.congress_number == settings.congress_number, Bill.is_published.is_(True),
                    tuple_(Bill.bill_type, Bill.bill_number).in_(list(chamber_of)), or_(*mine),
                ).order_by(followers.desc(), Bill.bill_type, Bill.bill_number)
            ):
                if bill.id in seen or len(digest.coming_up) >= MAX_COMING_UP:
                    continue
                house = chamber_of[(bill.bill_type, bill.bill_number)] == "house"
                digest.coming_up.append((bill, "Scheduled for a House vote" if house else "On the Senate’s agenda"))

    for bill, _ in digest.followed + digest.passed + digest.coming_up:
        party = (bill.sponsor_party or "?")[:1]
        digest.party_mix[party] = digest.party_mix.get(party, 0) + 1
    return digest
