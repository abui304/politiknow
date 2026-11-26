""""Since your last visit": up to three plain lines about what changed for this person since they were last
here: bills they follow, their members of Congress, their topics. Compared against users.previous_visit_at,
which moves forward at the start of each new visit (deps.record_activity)."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import explain
from app.models import Bill, BillFollow, MemberVote, RollCall, User
from app.schemas import SinceItem, SinceOut
from app.services.notify import ALERT_VOTE_KINDS, followed_tags, members_of


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


async def since_last_visit(db: AsyncSession, user: User) -> SinceOut:
    since = user.previous_visit_at
    if not since:
        return SinceOut(since=None, items=[])
    items: list[SinceItem] = []

    # 1. Bills you follow that moved.
    moved = list(await db.scalars(
        select(Bill).join(BillFollow, BillFollow.bill_id == Bill.id)
        .where(BillFollow.user_id == user.id, Bill.is_published.is_(True), Bill.last_action_date > since)
        .order_by(Bill.last_action_date.desc())
    ))
    if moved:
        top = moved[0]
        reached = [s for s, day in (top.milestones or {}).items() if day and day >= since.date().isoformat()]
        what = (
            f"{top.label} {explain.PAST.get(top.status, 'moved')}" if top.status in reached
            else f"New action on {top.label}"
        )
        more = f", and {_plural(len(moved) - 1, 'other bill')} you follow moved" if len(moved) > 1 else ""
        items.append(SinceItem(kind="bills", text=what + more, bill_id=top.id))

    # 2. Your members: recorded votes on passage or cloture.
    ids = await members_of(db, user)
    if ids:
        rows = list(await db.execute(
            select(RollCall.bill_id, RollCall.measure)
            .where(
                RollCall.voted_at > since, RollCall.kind.in_(ALERT_VOTE_KINDS),
                RollCall.id.in_(select(MemberVote.roll_call_id).where(MemberVote.bioguide_id.in_(ids))),
            )
            .order_by(RollCall.voted_at.desc())
        ))
        measures = {m for _, m in rows if m}
        if rows:
            n = len(measures) or len(rows)
            first_bill = next((b for b, _ in rows if b), None)
            published = await db.scalar(select(Bill.id).where(Bill.id == first_bill, Bill.is_published.is_(True))) \
                if first_bill else None
            items.append(SinceItem(
                kind="members", text=f"Your members of Congress voted on {_plural(n, 'bill')}", bill_id=published
            ))

    # 3. Your topics: new bills.
    tags = sorted(followed_tags(user))
    if tags:
        new_by_tag = dict((await db.execute(
            select(func.jsonb_array_elements_text(Bill.primary_tags).label("tag"), func.count())
            .where(Bill.is_published.is_(True), Bill.ingested_at > since)
            .group_by("tag")
        )).all())
        hits = [(t, new_by_tag[t]) for t in tags if new_by_tag.get(t)]
        if hits:
            hits.sort(key=lambda h: -h[1])
            total = sum(n for _, n in hits)
            names = f"{hits[0][0]}, {hits[1][0]} and more" if len(hits) > 2 else " and ".join(t for t, _ in hits)
            items.append(SinceItem(kind="topics", text=f"{_plural(total, 'new bill')} in {names}", tag=hits[0][0]))

    return SinceOut(since=since, items=items)
