"""A small, fixed set of product events for measuring retention (see models.EVENT_NAMES).

Day precision only, no free text, and nothing about the device or network. Deleted with the account."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.deps import DB, CurrentUser
from app.models import Event

router = APIRouter(prefix="/events", tags=["events"])

EventName = Literal["recap_open", "since_item_open", "floor_week_open", "glossary_tap", "share", "contact_member"]


class EventIn(BaseModel):
    name: EventName
    ref_id: str | None = Field(default=None, max_length=64)


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def record_event(body: EventIn, db: DB, user: CurrentUser):
    db.add(Event(user_id=user.id, day=datetime.now(UTC).date(), name=body.name, ref_id=body.ref_id))
    await db.commit()
