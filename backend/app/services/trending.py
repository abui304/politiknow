"""Trending (spec 5.2), run every 30 minutes:
trending_score = (comments_24h * 3 + net_votes_24h) / total_active_users"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, Comment, User, Vote
from app.services import notify

log = logging.getLogger(__name__)


async def recalculate(db: AsyncSession) -> dict:
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    active_users = await db.scalar(
        select(func.count()).where(User.last_active_at >= now - timedelta(days=7))
    ) or 1

    comments = dict((await db.execute(
        select(Comment.bill_id, func.count())
        .where(Comment.created_at >= day_ago, Comment.is_hidden.is_(False))
        .group_by(Comment.bill_id)
    )).all())
    votes = dict((await db.execute(
        select(Vote.bill_id, func.sum(Vote.value)).where(Vote.created_at >= day_ago).group_by(Vote.bill_id)
    )).all())

    scores = {
        bill_id: (comments.get(bill_id, 0) * 3.0 + (votes.get(bill_id) or 0) * 1.0) / active_users
        for bill_id in set(comments) | set(votes)
    }
    trending_ids = {bid for bid, s in scores.items() if s > settings.trending_threshold}
    previously = set(await db.scalars(select(Bill.id).where(Bill.is_trending.is_(True))))

    await db.execute(
        update(Bill).where(Bill.is_trending.is_(True) | (Bill.trending_score != 0))
        .values(is_trending=False, trending_score=0)
    )
    pushes: list[dict] = []
    for bill_id, score in scores.items():
        bill = await db.get(Bill, bill_id)
        if not bill:
            continue
        bill.trending_score = score
        bill.is_trending = bill_id in trending_ids
        if bill.is_trending and bill_id not in previously:
            pushes += await notify.notify_trending(db, bill)
    await db.commit()
    await notify.send_pushes(pushes)
    log.info("Trending: %s bills trending of %s scored (%s active users)", len(trending_ids), len(scores), active_users)
    return {"trending": len(trending_ids), "active_users": active_users}
