import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.deps import DB, CurrentUser
from app.models import Notification
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(db: DB, user: CurrentUser, limit: int = 50):
    return list(await db.scalars(
        select(Notification).where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()).limit(min(limit, 100))
    ))


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(db: DB, user: CurrentUser):
    await db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()


class OpenIn(BaseModel):
    channel: Literal["in_app", "push", "email"] = "in_app"


@router.post("/{notification_id}/open", status_code=status.HTTP_204_NO_CONTENT)
async def mark_opened(notification_id: uuid.UUID, body: OpenIn, db: DB, user: CurrentUser):
    """Records the first time an alert was opened, and from where. Feeds the alert open-to-visit rate."""
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id, Notification.opened_at.is_(None))
        .values(opened_at=datetime.now(UTC), channel=body.channel, is_read=True)
    )
    await db.commit()
