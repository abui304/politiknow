"""The weekly recap ("Your week in Congress") and one-click unsubscribe from its email."""

from datetime import date

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.models import Bill, User
from app.schemas import DigestBill, DigestOut
from app.services import digest as digest_service
from app.services import floor

router = APIRouter(tags=["digest"])


def _bill(b: Bill, what: str) -> DigestBill:
    return DigestBill(id=b.id, label=b.label, title=b.title, sponsor_party=b.sponsor_party, what=what)


@router.get("/digest", response_model=DigestOut)
async def get_digest(db: DB, redis: RedisDep, user: CurrentUser, week: date | None = Query(None)):
    """The recap for the week containing `week` (default: this week), built by the rules in services/digest.py."""
    floor_week = None
    if week is None or digest_service.week_bounds(week)[0] == digest_service.week_bounds(date.today())[0]:
        try:
            floor_week = await floor.this_week(redis)
        except Exception:  # the floor schedule is a nice-to-have here
            floor_week = None
    d = await digest_service.build(db, user, week, floor_week)
    return DigestOut(
        week_start=d.week_start,
        followed=[_bill(b, w) for b, w in d.followed],
        votes=d.votes,
        passed=[_bill(b, w) for b, w in d.passed],
        coming_up=[_bill(b, w) for b, w in d.coming_up],
        floor_count=d.floor_count,
        has_members=d.has_members,
        is_empty=d.is_empty,
    )


PAGE = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PolitiKNOW</title></head><body style="background:#FAF7F4;color:#2B2622;font-family:Georgia,serif;
max-width:480px;margin:60px auto;padding:0 20px;line-height:1.5"><h1 style="font-size:22px">{title}</h1>
<p>{body}</p><p><a href="{web}" style="color:#2B2622">Open PolitiKNOW</a></p></body></html>"""


async def _unsubscribe(db, token: str) -> bool:
    user = await db.scalar(select(User).where(User.recap_token == token)) if token else None
    if user:
        user.recap_email = False
        await db.commit()
    return user is not None


@router.get("/recap/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_page(db: DB, token: str = Query("", max_length=100)):
    """The link at the bottom of every recap email. Works without signing in."""
    ok = await _unsubscribe(db, token)
    title, body = (
        ("You're unsubscribed", "You won't get the weekly recap email anymore. It's still in the app, and you can "
         "turn the email back on in Settings.")
        if ok else ("That link didn't work", "It may be from an older email. You can turn the recap email off "
                    "in Settings.")
    )
    return PAGE.format(title=title, body=body, web=settings.web_url)


@router.post("/recap/unsubscribe", status_code=200)
async def unsubscribe_one_click(db: DB, token: str = Query("", max_length=100)):
    """One-click unsubscribe from the mail app's own button (RFC 8058)."""
    await _unsubscribe(db, token)
    return {"ok": True}
