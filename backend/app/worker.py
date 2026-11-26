"""Optional Celery worker (TASK_MODE=celery). By default nothing needs to run alongside the API:
per-comment jobs run right after the request (app/jobs.py), trending refreshes itself while people use the
app, and ingestion runs on a schedule from GitHub Actions (.github/workflows/jobs.yml).

Run with:  celery -A app.worker worker --beat --loglevel=info
"""

import asyncio
import uuid

from celery import Celery
from celery.schedules import crontab

from app.config import settings
from app.db import worker_sessionmaker

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
    from app import jobs

    return _run(jobs.prune)


@celery_app.task
def moderate_comment(comment_id: str):
    from app import jobs

    return _run(jobs.moderate_comment, uuid.UUID(comment_id))


@celery_app.task
def notify_followers_of_comment(comment_id: str):
    from app import jobs

    return _run(jobs.notify_followers_of_comment, uuid.UUID(comment_id))
