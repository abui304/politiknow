"""Personalized feed (spec 5.1), plus follows:
feed_score = tag_relevance*0.45 + recency*0.25 + trending_boost*0.20 + social_signal*0.10
             + follow_signal*0.20

follow_signal: the bill is one you follow, or a legislator you follow sponsored or cosponsored it.
Each bill also gets a `reason` ("Because you follow Health"); see reason().

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
from app.models import (
    Bill,
    BillCosponsor,
    BillFollow,
    Comment,
    Follow,
    Legislator,
    LegislatorFollow,
    User,
    UserTagInteraction,
    Vote,
)
from app.services import notify

WEIGHTS = {"tag": 0.45, "recency": 0.25, "trending": 0.20, "social": 0.10, "follow": 0.20}
DISCUSSED_DAYS = 7
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


def components(
    bill: Bill, weights: dict[str, float], social_ids: set[uuid.UUID], follow_reasons: dict, now: datetime
) -> dict[str, float]:
    """Each signal's weighted contribution to the bill's score."""
    tag_relevance = min(sum(weights.get(t, 0.0) for t in bill.primary_tags), 1.0)
    return {
        "follow": (1.0 if bill.id in follow_reasons else 0.0) * WEIGHTS["follow"],
        "tag": tag_relevance * WEIGHTS["tag"],
        "trending": (1.0 if bill.is_trending else 0.0) * WEIGHTS["trending"],
        "social": (1.0 if bill.id in social_ids else 0.0) * WEIGHTS["social"],
        "recency": recency(bill.last_action_date, now) * WEIGHTS["recency"],
    }


def score(bill: Bill, weights: dict[str, float], social_ids: set[uuid.UUID], now: datetime) -> float:
    return sum(components(bill, weights, social_ids, {}, now).values())


def reason(
    bill: Bill, parts: dict[str, float], weights: dict[str, float], topics: set[str], follow_reasons: dict
) -> str:
    """The most personal signal that applies: something you follow, then your topics, then people you
    follow, then trending. Only bills with none of those say they're simply recent. (Recency often
    outweighs a single topic in the score, but "it's recent" doesn't explain why it's yours.)"""
    if parts["follow"]:
        return follow_reasons[bill.id]
    if parts["tag"]:
        tag = max((t for t in bill.primary_tags if t in weights), key=lambda t: weights[t])
        return f"Because you follow {tag}" if tag in topics else f"Because you've been reading about {tag}"
    if parts["social"]:
        return "People you follow weighed in on this"
    if parts["trending"]:
        return "Trending on PolitiKNOW"
    return "Recent activity in Congress"


async def _follow_reasons(db: AsyncSession, user: User, bills: list[Bill]) -> dict[uuid.UUID, str]:
    """Bills in `bills` the user follows directly or through a legislator they follow, with why."""
    ids = [b.id for b in bills]
    out: dict[uuid.UUID, str] = {}
    followed = select(LegislatorFollow.bioguide_id).where(LegislatorFollow.user_id == user.id)
    legislators = await db.scalars(select(Legislator).where(Legislator.bioguide_id.in_(followed)))
    names = {m.bioguide_id: m.name for m in legislators}
    if names:
        cosponsored = await db.execute(
            select(BillCosponsor.bill_id, BillCosponsor.bioguide_id)
            .where(BillCosponsor.bioguide_id.in_(list(names)), BillCosponsor.bill_id.in_(ids))
        )
        for bill_id, member in cosponsored:
            out.setdefault(bill_id, f"Cosponsored by {names[member]}, who you follow")
        for b in bills:
            if b.sponsor_id in names:
                out[b.id] = f"Sponsored by {names[b.sponsor_id]}, who you follow"
    for bill_id in await db.scalars(
        select(BillFollow.bill_id).where(BillFollow.user_id == user.id, BillFollow.bill_id.in_(ids))
    ):
        out[bill_id] = "You follow this bill"
    return out


async def rank(db: AsyncSession, user: User) -> list[tuple[str, str]]:
    """Every candidate bill's id with the reason it's shown, best first."""
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
    follow_reasons = await _follow_reasons(db, user, candidates)
    topics = notify.followed_tags(user) | set(user.onboarding_tags or [])
    ranked = []
    for b in candidates:
        parts = components(b, weights, social_ids, follow_reasons, now)
        ranked.append((sum(parts.values()), str(b.id), reason(b, parts, weights, topics, follow_reasons)))
    ranked.sort(key=lambda r: r[0], reverse=True)
    return [(bill_id, why) for _, bill_id, why in ranked]


async def page(
    db: AsyncSession, redis: Redis, user: User, cursor: int, limit: int
) -> tuple[list[Bill], dict[uuid.UUID, str], int | None]:
    """A page of the ranked feed: (bills, reason per bill, next cursor)."""
    key = f"feed:{user.id}"
    cached = None if cursor == 0 else await redis.get(key)
    ranked = json.loads(cached) if cached else await rank(db, user)
    if not cached:
        await redis.set(key, json.dumps(ranked), ex=settings.feed_cache_seconds)

    window = {uuid.UUID(i): why for i, why in ranked[cursor : cursor + limit]}
    by_id = {b.id: b for b in await db.scalars(select(Bill).where(Bill.id.in_(list(window))))}
    bills = [by_id[i] for i in window if i in by_id]
    next_cursor = cursor + limit if cursor + limit < len(ranked) else None
    return bills, window, next_cursor


async def most_discussed(
    db: AsyncSession, cursor: int, limit: int
) -> tuple[list[Bill], dict[uuid.UUID, str], int | None]:
    """Bills with the most visible comments in the last week, then the most comments overall."""
    since = datetime.now(UTC) - timedelta(days=DISCUSSED_DAYS)
    recent = (
        select(Comment.bill_id, func.count().label("n"))
        .where(Comment.created_at >= since, Comment.is_hidden.is_(False))
        .group_by(Comment.bill_id).subquery()
    )
    n = func.coalesce(recent.c.n, 0)
    rows = (await db.execute(
        select(Bill, n).outerjoin(recent, recent.c.bill_id == Bill.id)
        .where(Bill.is_published.is_(True), (n > 0) | (Bill.comment_count > 0))
        .order_by(n.desc(), Bill.comment_count.desc(), Bill.last_action_date.desc().nulls_last(), Bill.id)
        .offset(cursor).limit(limit + 1)
    )).all()
    reasons = {
        b.id: f"{count} comment{'s' if count != 1 else ''} this week" if count
        else f"{b.comment_count} comment{'s' if b.comment_count != 1 else ''}"
        for b, count in rows[:limit]
    }
    return [b for b, _ in rows[:limit]], reasons, cursor + limit if len(rows) > limit else None
