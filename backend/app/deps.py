from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import ActivityDay, User
from app.redis_client import get_redis
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]

ACTIVE_TOUCH_SECONDS = 600
# A gap this long between requests starts a new visit: "since your last visit" then counts from the old one.
VISIT_GAP = timedelta(hours=1)
PLATFORMS = {"ios", "android", "web"}


async def get_user_allow_incomplete(
    request: Request,
    db: DB,
    redis: RedisDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    """Any signed-in user, including a social-login user who hasn't picked a display name yet."""
    user_id = decode_access_token(creds.credentials) if creds else None
    user = await db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")

    # "Active users" for trending = opened the app in the last 7 days (spec 5.2).
    # Throttled so every request doesn't write to the users table.
    if await redis.set(f"active:{user.id}", "1", ex=ACTIVE_TOUCH_SECONDS, nx=True):
        await record_activity(db, user, request.headers.get("x-client"))
    return user


async def record_activity(db: AsyncSession, user: User, client: str | None) -> None:
    """Marks today as an active day (for retention by cohort) and, after a long enough gap, starts a new
    visit so "since your last visit" has a fixed point to compare against."""
    now = datetime.now(UTC)
    if user.last_active_at and now - user.last_active_at > VISIT_GAP:
        user.previous_visit_at = user.last_active_at
    user.last_active_at = now
    platform = client if client in PLATFORMS else None
    stmt = insert(ActivityDay).values(user_id=user.id, day=now.date(), platform=platform)
    await db.execute(stmt.on_conflict_do_update(
        index_elements=[ActivityDay.user_id, ActivityDay.day],
        set_={"platform": func.coalesce(ActivityDay.platform, stmt.excluded.platform)},
    ))
    await db.commit()


def needs_email_check(user: User) -> bool:
    """An account whose email address hasn't been confirmed yet, while confirmation is required."""
    from app.config import settings

    return settings.email_confirmation_on and not user.email_verified


async def get_current_user(user: Annotated[User, Depends(get_user_allow_incomplete)]) -> User:
    # Nothing else works until the email is confirmed; the app shows the "check your inbox" screen instead.
    if needs_email_check(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "email_unconfirmed")
    # Spec 6.2: choosing a display name is mandatory regardless of auth method.
    if not user.display_name:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "display_name_required")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
IncompleteUser = Annotated[User, Depends(get_user_allow_incomplete)]


async def get_moderator(user: CurrentUser) -> User:
    if not user.is_moderator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderators only")
    return user


Moderator = Annotated[User, Depends(get_moderator)]
