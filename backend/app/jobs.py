"""Background work as plain async functions, so it can run three ways: right after the request that
caused it (FastAPI background tasks, the default), from a scheduled CLI command (GitHub Actions), or on a
Celery worker for anyone still running one (TASK_MODE=celery)."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import worker_sessionmaker
from app.models import Bill, Comment, Event, User, UserTagInteraction

log = logging.getLogger(__name__)

# Raw events are kept for 13 months, enough for a year-over-year look, then deleted.
EVENT_RETENTION = timedelta(days=396)


async def moderate_comment(db: AsyncSession, comment_id: uuid.UUID) -> None:
    from app.services.moderation import moderate_comment as moderate

    await moderate(db, comment_id)


async def notify_followers_of_comment(db: AsyncSession, comment_id: uuid.UUID) -> None:
    from app.services import notify

    comment = await db.get(Comment, comment_id)
    if not comment or comment.is_hidden:
        return
    actor = await db.get(User, comment.user_id)
    if actor.is_shadow_banned:
        return
    bill = await db.get(Bill, comment.bill_id)
    pushes = await notify.notify_social(db, actor, bill)
    await db.commit()
    await notify.send_pushes(pushes)


async def prune(db: AsyncSession) -> str:
    now = datetime.now(UTC)
    await db.execute(delete(UserTagInteraction).where(UserTagInteraction.created_at < now - timedelta(days=30)))
    await db.execute(delete(Event).where(Event.day < (now - EVENT_RETENTION).date()))
    await db.commit()
    return "Pruned old interactions and events."


async def recalculate_trending(db: AsyncSession):
    from app.services.trending import recalculate

    return await recalculate(db)


COMMENT_JOBS = {"moderate_comment": moderate_comment, "notify_followers_of_comment": notify_followers_of_comment}


async def run_in_own_session(name: str, *args) -> None:
    """Runs a job with its own database session, after the request's session has closed.
    Failures are logged, never raised: background work must not break anything the user sees."""
    try:
        sessions = worker_sessionmaker()
        async with sessions() as db:
            fn = COMMENT_JOBS.get(name) or {"recalculate_trending": recalculate_trending}[name]
            await fn(db, *args)
    except Exception:
        log.exception("Background job %s failed", name)
