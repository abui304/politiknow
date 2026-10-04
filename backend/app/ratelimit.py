import time
import uuid

from fastapi import HTTPException, status
from redis.asyncio import Redis


async def enforce_hourly_limit(redis: Redis, action: str, user_id: uuid.UUID, limit: int) -> None:
    """Sliding one-hour window, stored as a sorted set of timestamps."""
    key = f"rl:{action}:{user_id}"
    now = time.time()
    async with redis.pipeline(transaction=True) as pipe:
        pipe.zremrangebyscore(key, 0, now - 3600)
        pipe.zcard(key)
        _, count = await pipe.execute()
    if count >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Slow down! You can only do this {limit} times per hour.",
        )
    async with redis.pipeline(transaction=True) as pipe:
        pipe.zadd(key, {f"{now}:{uuid.uuid4().hex[:6]}": now})
        pipe.expire(key, 3600)
        await pipe.execute()
