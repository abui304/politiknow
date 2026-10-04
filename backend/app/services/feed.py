"""Personalized feed (spec 5.1):
feed_score = tag_relevance*0.45 + recency*0.25 + trending_boost*0.20 + social_signal*0.10

The ranked list of bill IDs is cached in Redis per user so infinite-scroll pages stay
stable; pulling to refresh (cursor 0) re-ranks."""

import json
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, Comment, Follow, User, UserTagInteraction, Vote

WEIGHTS = {"tag": 0.45, "recency": 0.25, "trending": 0.20, "social": 0.10}
MAX_CANDIDATES = 1000


async def tag_weights(db: AsyncSession, user: User) -> dict[str, float]:
    """Share of the user's last-30-day interactions per tag, with onboarding picks as synthetic interactions."""
    since = datetime.now(UTC) - timedelta(days=30)
    rows = await db.execute(
        select(UserTagInteraction.tag_id, func.count())
        .where(UserTagInteraction.user_id == user.id, UserTagInteraction.created_at >= since)
        .group_by(UserTagInteraction.tag_id)
    )
    counts = Counter(dict(rows.all()))
    for tag in user.onboarding_tags or []:
        counts[tag] += settings.onboarding_seed_weight
    total = sum(counts.values())
    return {tag: n / total for tag, n in counts.items()} if total else {}


def recency(last_action: datetime | None, now: datetime) -> float:
    if not last_action:
        return 0.0
    age_days = max((now - last_action).total_seconds() / 86400, 0)
    return 0.5 ** (age_days / settings.feed_recency_half_life_days)


def score(bill: Bill, weights: dict[str, float], social_ids: set[uuid.UUID], now: datetime) -> float:
    tag_relevance = min(sum(weights.get(t, 0.0) for t in bill.primary_tags), 1.0)
    return (
        tag_relevance * WEIGHTS["tag"]
        + recency(bill.last_action_date, now) * WEIGHTS["recency"]
        + (1.0 if bill.is_trending else 0.0) * WEIGHTS["trending"]
        + (1.0 if bill.id in social_ids else 0.0) * WEIGHTS["social"]
    )


async def rank(db: AsyncSession, user: User) -> list[str]:
    now = datetime.now(UTC)
    candidates = list(await db.scalars(
        select(Bill)
        .where(Bill.is_published.is_(True))
        .order_by(Bill.last_action_date.desc().nulls_last())
        .limit(MAX_CANDIDATES)
    ))
    weights = await tag_weights(db, user)
    following = select(Follow.following_id).where(Follow.follower_id == user.id)
    social_ids = set(await db.scalars(
        select(Vote.bill_id).where(Vote.user_id.in_(following))
        .union(select(Comment.bill_id).where(Comment.user_id.in_(following), Comment.is_hidden.is_(False)))
    ))
    candidates.sort(key=lambda b: score(b, weights, social_ids, now), reverse=True)
    return [str(b.id) for b in candidates]


async def page(db: AsyncSession, redis: Redis, user: User, cursor: int, limit: int) -> tuple[list[Bill], int | None]:
    key = f"feed:{user.id}"
    cached = None if cursor == 0 else await redis.get(key)
    ids = json.loads(cached) if cached else await rank(db, user)
    if not cached:
        await redis.set(key, json.dumps(ids), ex=settings.feed_cache_seconds)

    window = [uuid.UUID(i) for i in ids[cursor : cursor + limit]]
    by_id = {b.id: b for b in await db.scalars(select(Bill).where(Bill.id.in_(window)))}
    bills = [by_id[i] for i in window if i in by_id]
    next_cursor = cursor + limit if cursor + limit < len(ids) else None
    return bills, next_cursor
