"""Passwords and tokens (spec 6.1): bcrypt cost 12, 15-minute access JWTs,
30-day refresh tokens tracked in Redis so they can be revoked."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from redis.asyncio import Redis

from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return uuid.UUID(payload["sub"])


async def create_refresh_token(redis: Redis, user_id: uuid.UUID) -> str:
    token = secrets.token_urlsafe(48)
    ttl = int(timedelta(days=settings.refresh_token_days).total_seconds())
    await redis.set(f"refresh:{token}", str(user_id), ex=ttl)
    return token


async def consume_refresh_token(redis: Redis, token: str) -> uuid.UUID | None:
    """Refresh tokens are single-use: each refresh rotates to a new one."""
    user_id = await redis.getdel(f"refresh:{token}")
    return uuid.UUID(user_id) if user_id else None


async def revoke_refresh_token(redis: Redis, token: str) -> None:
    await redis.delete(f"refresh:{token}")
