"""The weekly retention scorecard (python -m app.cli metrics). Plain SQL over data we already keep:
activity_days, follows, notifications and events. No third-party analytics."""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityDay, BillFollow, DistrictFollow, Event, LegislatorFollow, Notification, User


@dataclass
class Scorecard:
    week_start: date
    weekly_active: int = 0
    # North star: users with at least one follow who opened an update about something they follow this week.
    weekly_informed_followers: int = 0
    new_users: int = 0
    activated: int = 0  # new users (signed up 7-14 days ago) who set a district and have 3+ follows
    activation_cohort: int = 0
    alerts_delivered: int = 0
    alerts_opened: int = 0
    recap_opens: int = 0
    # signup week -> share of that cohort active in weeks 1..4 after signup
    cohorts: dict[date, list[float]] = field(default_factory=dict)

    def lines(self) -> list[str]:
        pct = lambda a, b: f"{(100 * a / b):.0f}%" if b else "n/a"  # noqa: E731
        out = [
            f"Week of {self.week_start:%b %-d, %Y}",
            f"  Weekly informed followers (north star): {self.weekly_informed_followers}",
            f"  Weekly active users: {self.weekly_active}",
            f"  New users: {self.new_users}",
            f"  Activation (signed up 1-2 weeks ago): {self.activated}/{self.activation_cohort}"
            f" = {pct(self.activated, self.activation_cohort)}",
            f"  Alert open-to-visit: {self.alerts_opened}/{self.alerts_delivered}"
            f" = {pct(self.alerts_opened, self.alerts_delivered)}",
            f"  Recap opens: {self.recap_opens}",
            "  Cohort retention (share active in week 1, 2, 3, 4 after signup):",
        ]
        for start, shares in sorted(self.cohorts.items()):
            out.append(f"    {start:%b %-d}: " + "  ".join(f"{s * 100:4.0f}%" for s in shares))
        return out


def _follow_count(user_id_col):
    return (
        select(func.count()).select_from(BillFollow).where(BillFollow.user_id == user_id_col).scalar_subquery()
        + select(func.count()).select_from(LegislatorFollow).where(LegislatorFollow.user_id == user_id_col)
        .scalar_subquery()
        + select(func.count()).select_from(DistrictFollow).where(DistrictFollow.user_id == user_id_col)
        .scalar_subquery()
    )


async def scorecard(db: AsyncSession, today: date | None = None, cohort_weeks: int = 6) -> Scorecard:
    today = today or datetime.now(UTC).date()
    week_start = today - timedelta(days=today.weekday())  # Monday
    week_end = week_start + timedelta(days=7)
    card = Scorecard(week_start=week_start)
    in_week = and_(ActivityDay.day >= week_start, ActivityDay.day < week_end)

    card.weekly_active = await db.scalar(select(func.count(distinct(ActivityDay.user_id))).where(in_week)) or 0

    opened_alert = select(Notification.user_id).where(
        Notification.opened_at >= datetime.combine(week_start, datetime.min.time(), UTC),
        Notification.opened_at < datetime.combine(week_end, datetime.min.time(), UTC),
    )
    opened_update = select(Event.user_id).where(
        Event.day >= week_start, Event.day < week_end, Event.name.in_(("recap_open", "since_item_open"))
    )
    card.weekly_informed_followers = await db.scalar(
        select(func.count()).select_from(User).where(
            _follow_count(User.id) >= 1, or_(User.id.in_(opened_alert), User.id.in_(opened_update))
        )
    ) or 0

    start_dt = datetime.combine(week_start, datetime.min.time(), UTC)
    end_dt = datetime.combine(week_end, datetime.min.time(), UTC)
    card.new_users = await db.scalar(
        select(func.count()).select_from(User).where(User.created_at >= start_dt, User.created_at < end_dt)
    ) or 0

    cohort_from = datetime.combine(today - timedelta(days=14), datetime.min.time(), UTC)
    cohort_to = datetime.combine(today - timedelta(days=7), datetime.min.time(), UTC)
    in_cohort = and_(User.created_at >= cohort_from, User.created_at < cohort_to)
    card.activation_cohort = await db.scalar(select(func.count()).select_from(User).where(in_cohort)) or 0
    card.activated = await db.scalar(
        select(func.count()).select_from(User).where(
            in_cohort, User.home_district.is_not(None), _follow_count(User.id) >= 3
        )
    ) or 0

    delivered = and_(
        Notification.created_at >= start_dt, Notification.created_at < end_dt, Notification.backfill.is_(False)
    )
    card.alerts_delivered = await db.scalar(select(func.count()).select_from(Notification).where(delivered)) or 0
    card.alerts_opened = await db.scalar(
        select(func.count()).select_from(Notification).where(delivered, Notification.opened_at.is_not(None))
    ) or 0
    card.recap_opens = await db.scalar(
        select(func.count()).select_from(Event).where(
            Event.name == "recap_open", Event.day >= week_start, Event.day < week_end
        )
    ) or 0

    # Cohorts: users grouped by signup week; for each of the 4 weeks after, the share active that week.
    for k in range(cohort_weeks, 0, -1):
        c_start = week_start - timedelta(weeks=k)
        c_from = datetime.combine(c_start, datetime.min.time(), UTC)
        members = select(User.id).where(User.created_at >= c_from, User.created_at < c_from + timedelta(weeks=1))
        size = await db.scalar(select(func.count()).select_from(members.subquery())) or 0
        if not size:
            continue
        shares = []
        for n in range(1, 5):
            w_start = c_start + timedelta(weeks=n)
            if w_start >= week_end:
                break
            active = await db.scalar(
                select(func.count(distinct(ActivityDay.user_id))).where(
                    ActivityDay.user_id.in_(members),
                    ActivityDay.day >= w_start,
                    ActivityDay.day < w_start + timedelta(weeks=1),
                )
            ) or 0
            shares.append(active / size)
        card.cohorts[c_start] = shares
    return card
