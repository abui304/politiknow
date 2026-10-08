"""Notifications (spec 9). Every notification is stored for the in-app Notifications tab;
push delivery goes through Expo's free push service (which uses FCM/APNs underneath)."""

import logging
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, BillFollow, Comment, Follow, Legislator, LegislatorFollow, Notification, User, Vote
from app.schemas import NotificationPrefs

log = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def prefs_of(user: User) -> NotificationPrefs:
    return NotificationPrefs.model_validate(user.notification_preferences or {})


def followed_tags(user: User) -> set[str]:
    prefs = prefs_of(user)
    return set(prefs.tags if prefs.tags is not None else user.onboarding_tags or [])


def in_quiet_hours(user: User, now: datetime | None = None) -> bool:
    qh = prefs_of(user).quiet_hours
    if not qh:
        return False
    try:
        local = (now or datetime.now(UTC)).astimezone(ZoneInfo(qh.tz)).time()
    except Exception:
        return False
    start, end = time.fromisoformat(qh.start), time.fromisoformat(qh.end)
    return start <= local < end if start <= end else local >= start or local < end


async def _sent_today(db: AsyncSession, user_id: uuid.UUID) -> int:
    since = datetime.now(UTC) - timedelta(days=1)
    return await db.scalar(
        select(func.count()).where(Notification.user_id == user_id, Notification.created_at >= since)
    ) or 0


async def notify(
    db: AsyncSession, users: list[User], ntype: str, title: str, body: str, bill_id: uuid.UUID | None
) -> list[dict]:
    """Stores notifications and returns the Expo push messages to send (after commit)."""
    pushes: list[dict] = []
    for user in users:
        if not prefs_of(user).types.get(ntype, True):
            continue
        if await _sent_today(db, user.id) >= settings.notifications_per_day:
            continue
        db.add(Notification(user_id=user.id, type=ntype, title=title, body=body, bill_id=bill_id))
        if user.push_token and not in_quiet_hours(user):
            pushes.append({
                "to": user.push_token, "title": title, "body": body, "sound": "default",
                "data": {"bill_id": str(bill_id) if bill_id else None},
            })
    return pushes


async def send_pushes(messages: list[dict]) -> None:
    if not messages:
        return
    async with httpx.AsyncClient(timeout=20) as http:
        for i in range(0, len(messages), 100):  # Expo accepts up to 100 per request
            try:
                await http.post(EXPO_PUSH_URL, json=messages[i : i + 100])
            except httpx.HTTPError as e:
                log.warning("Expo push failed: %s", e)


async def users_following_tags(db: AsyncSession, tags: list[str]) -> list[User]:
    if not tags:
        return []
    tag_array = cast(tags, ARRAY(String))
    candidates = await db.scalars(
        select(User).where(
            User.display_name.is_not(None),
            or_(
                User.onboarding_tags.op("?|")(tag_array),
                User.notification_preferences["tags"].op("?|")(tag_array),
            ),
        )
    )
    return [u for u in candidates if followed_tags(u) & set(tags)]


async def users_engaged_with_bill(db: AsyncSession, bill_id: uuid.UUID) -> list[User]:
    voters = select(Vote.user_id).where(Vote.bill_id == bill_id)
    commenters = select(Comment.user_id).where(Comment.bill_id == bill_id)
    return list(await db.scalars(select(User).where(or_(User.id.in_(voters), User.id.in_(commenters)))))


async def users_following_bill(db: AsyncSession, bill_id: uuid.UUID) -> list[User]:
    """Followers plus anyone who voted or commented: everyone who wants to hear when it moves."""
    followers = select(BillFollow.user_id).where(BillFollow.bill_id == bill_id)
    engaged = {u.id: u for u in await users_engaged_with_bill(db, bill_id)}
    for u in await db.scalars(select(User).where(User.id.in_(followers))):
        engaged.setdefault(u.id, u)
    return list(engaged.values())


async def notify_new_bill(db: AsyncSession, bill: Bill) -> list[dict]:
    users = await users_following_tags(db, bill.primary_tags)
    tag = bill.primary_tags[0] if bill.primary_tags else "New"
    return await notify(db, users, "new_bill", f"New {tag} bill introduced", f"{bill.label} - {bill.title}", bill.id)


async def notify_status_change(db: AsyncSession, bill: Bill) -> list[dict]:
    users = await users_following_bill(db, bill.id)
    body = bill.latest_action_text or bill.status
    return await notify(db, users, "status_update", f"Update on {bill.label}", body, bill.id)


async def notify_trending(db: AsyncSession, bill: Bill) -> list[dict]:
    users = await users_following_tags(db, bill.primary_tags)
    tag = bill.primary_tags[0] if bill.primary_tags else "your topics"
    return await notify(
        db, users, "trending", f"Trending in {tag}", f"{bill.label} is generating significant discussion", bill.id
    )


async def notify_social(db: AsyncSession, actor: User, bill: Bill) -> list[dict]:
    """Followers of `actor` who have also interacted with this bill (spec 6.3)."""
    followers = select(Follow.follower_id).where(Follow.following_id == actor.id)
    engaged = {u.id for u in await users_engaged_with_bill(db, bill.id)}
    users = [u for u in await db.scalars(select(User).where(User.id.in_(followers))) if u.id in engaged]
    title = f"@{actor.display_name} commented"
    return await notify(db, users, "social", title, f"on {bill.label}: {bill.title}", bill.id)


async def notify_legislator_bill(
    db: AsyncSession, bill: Bill, sponsor_id: str | None, cosponsor_ids: set[str]
) -> list[dict]:
    """Followers of the bill's sponsor, or of members who just cosponsored it. Each follower hears once,
    about the member they follow (sponsor first)."""
    ids = [i for i in [sponsor_id, *sorted(cosponsor_ids - {sponsor_id})] if i]
    if not ids:
        return []
    names = {m.bioguide_id: m.name for m in await db.scalars(select(Legislator).where(Legislator.bioguide_id.in_(ids)))}
    follows = (await db.execute(
        select(LegislatorFollow.user_id, LegislatorFollow.bioguide_id).where(LegislatorFollow.bioguide_id.in_(ids))
    )).all()
    by_member: dict[str, list[uuid.UUID]] = {}
    seen: set[uuid.UUID] = set()
    for member in ids:
        for user_id, followed in follows:
            if followed == member and user_id not in seen:
                seen.add(user_id)
                by_member.setdefault(member, []).append(user_id)
    pushes: list[dict] = []
    for member, user_ids in by_member.items():
        users = list(await db.scalars(select(User).where(User.id.in_(user_ids))))
        verb = "sponsored" if member == sponsor_id else "cosponsored"
        title = f"{names.get(member, 'A legislator you follow')} {verb} a bill"
        pushes += await notify(db, users, "legislator", title, f"{bill.label} - {bill.title}", bill.id)
    return pushes
