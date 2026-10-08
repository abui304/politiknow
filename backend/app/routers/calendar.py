from datetime import date

from fastapi import APIRouter
from sqlalchemy import select, tuple_

from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.models import Bill
from app.schemas import FloorBill, FloorItem, FloorWeek
from app.services import floor

router = APIRouter(tags=["calendar"])


@router.get("/calendar", response_model=FloorWeek)
async def floor_calendar(db: DB, redis: RedisDep, _: CurrentUser):
    """What's scheduled on the House and Senate floors this week, linked to bills PolitiKNOW has."""
    week = await floor.this_week(redis)
    items = [("house", i) for i in week["house"]] + [("senate", i) for i in week["senate"]]
    keys = {label: key for _, i in items for label in i["bills"] if (key := floor.bill_key(label))}
    found = {}
    if keys:
        rows = await db.execute(
            select(Bill.bill_type, Bill.bill_number, Bill.id).where(
                Bill.congress_number == settings.congress_number,
                Bill.is_published.is_(True),
                tuple_(Bill.bill_type, Bill.bill_number).in_(list(set(keys.values()))),
            )
        )
        found = {(t, n): bill_id for t, n, bill_id in rows}

    def out(chamber, i) -> FloorItem:
        return FloorItem(
            chamber=chamber,
            day=date.fromisoformat(i["day"]) if i["day"] else None,
            heading=i["heading"],
            text=i["text"],
            bills=[FloorBill(label=label, bill_id=found.get(keys.get(label))) for label in i["bills"]],
        )

    return FloorWeek(
        week_of=date.fromisoformat(week["house_week_of"]),
        house=[out(c, i) for c, i in items if c == "house"],
        senate=[out(c, i) for c, i in items if c == "senate"],
        house_url=week["house_url"],
        senate_url=week["senate_url"],
    )
