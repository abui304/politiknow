"""Background jobs (spec 3.2): ingestion 4x daily, trending every 30 min, nightly pruning,
plus per-comment moderation and social notifications.

Run with:  celery -A app.worker worker --beat --loglevel=info
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import delete

from app.config import settings
from app.db import worker_sessionmaker
from app.models import Bill, Comment, User, UserTagInteraction

celery_app = Celery("politiknow", broker=settings.redis_url, backend=None)
celery_app.conf.update(
    timezone="UTC",
    task_ignore_result=True,
    beat_schedule={
        "ingest-bills": {
            "task": "app.worker.ingest_bills",
            "schedule": crontab(minute=0, hour=",".join(map(str, settings.ingest_times_utc))),
        },
        "recalculate-trending": {"task": "app.worker.recalculate_trending", "schedule": crontab(minute="*/30")},
        "prune-interactions": {"task": "app.worker.prune_interactions", "schedule": crontab(minute=15, hour=4)},
    },
)


def _run(coro_fn, *args):
    async def main():
        sessions = worker_sessionmaker()
        async with sessions() as db:
            return await coro_fn(db, *args)

    return asyncio.run(main())


@celery_app.task
def ingest_bills():
    from app.services.ingest import run_ingestion

    return _run(run_ingestion)


@celery_app.task
def recalculate_trending():
    from app.services.trending import recalculate

    return _run(recalculate)


@celery_app.task
def prune_interactions():
    async def prune(db):
        cutoff = datetime.now(UTC) - timedelta(days=30)
        await db.execute(delete(UserTagInteraction).where(UserTagInteraction.created_at < cutoff))
        await db.commit()

    return _run(prune)


@celery_app.task
def moderate_comment(comment_id: str):
    from app.services.moderation import moderate_comment as moderate

    return _run(moderate, uuid.UUID(comment_id))


@celery_app.task
def notify_followers_of_comment(comment_id: str):
    from app.services import notify

    async def run(db, cid):
        comment = await db.get(Comment, cid)
        if not comment or comment.is_hidden:
            return
        actor = await db.get(User, comment.user_id)
        if actor.is_shadow_banned:
            return
        bill = await db.get(Bill, comment.bill_id)
        pushes = await notify.notify_social(db, actor, bill)
        await db.commit()
        await notify.send_pushes(pushes)

    return _run(run, uuid.UUID(comment_id))
