from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.redis_client import get_redis
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]

ACTIVE_TOUCH_SECONDS = 600


async def get_user_allow_incomplete(
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
        user.last_active_at = datetime.now(UTC)
        await db.commit()
    return user


async def get_current_user(user: Annotated[User, Depends(get_user_allow_incomplete)]) -> User:
    # Spec 6.2: choosing a display name is mandatory regardless of auth method.
    if not user.display_name:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "display_name_required")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
IncompleteUser = Annotated[User, Depends(get_user_allow_incomplete)]
