"""The weekly recap, "Your week in Congress": built from data already stored, by fixed rules, with no AI.

What goes in, in this order (the same rules for everyone, published on the About page):
1. Bills you follow that moved this week.
2. How your members voted on final passage and cloture this week.
3. What Congress passed this week: bills that passed a chamber or became law, most-followed first.
4. What's scheduled on the floor.
Every section is capped, so the recap is short and ends.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import explain
from app.models import Bill, BillFollow, MemberVote, RollCall, User
from app.services.notify import ALERT_VOTE_KINDS, members_of
from app.services.votes import with_members

MAX_FOLLOWED = 6
MAX_VOTES = 6
MAX_PASSED = 6
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
    floor: list[dict] = field(default_factory=list)  # {chamber, label, bill_id}
    # Sponsor party of every bill picked by rules 1 and 3, as a neutrality check (logged, not shown).
    party_mix: dict[str, int] = field(default_factory=dict)

    @property
    def is_empty(self) -> bool:
        return not (self.followed or self.votes or self.passed)


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

    # 4. On the floor (from the cached House and Senate schedules), when given.
    if floor_week:
        for chamber in ("house", "senate"):
            for item in floor_week.get(chamber, []):
                for label in item.get("bills", []):
                    digest.floor.append({"chamber": chamber, "label": label})
        digest.floor = digest.floor[:8]

    for bill, _ in digest.followed + digest.passed:
        party = (bill.sponsor_party or "?")[:1]
        digest.party_mix[party] = digest.party_mix.get(party, 0) + 1
    return digest
