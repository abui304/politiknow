"""The weekly recap email: opt-in, sent through Brevo's free plan (300 emails a day), with a one-click
unsubscribe. It's the only email PolitiKNOW sends besides sign-in. No tracking pixels or tracked links.

Without BREVO_API_KEY, nothing is sent and the recap stays in the app."""

import html
import logging
from datetime import UTC, datetime

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User
from app.services import digest as digest_service

log = logging.getLogger(__name__)
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

INK, SOFT, PAPER, LINE = "#2B2622", "#5C544D", "#FAF7F4", "#E9E3DD"
SERIF = "Georgia, 'Times New Roman', serif"


def unsubscribe_url(user: User) -> str:
    return f"{settings.api_url}/recap/unsubscribe?token={user.recap_token}"


def subject(d: digest_service.Digest) -> str:
    if d.followed:
        n = len(d.followed)
        return f"Your week in Congress: {n} {'bill' if n == 1 else 'bills'} you follow moved"
    if d.votes:
        return "Your week in Congress: how your members voted"
    return f"Your week in Congress: {len(d.passed)} {'bill' if len(d.passed) == 1 else 'bills'} passed"


def _bill_line(label: str, title: str, what: str, url: str) -> str:
    return (
        f'<p style="margin:0 0 14px"><a href="{url}" style="color:{INK};font-weight:600">{html.escape(label)}</a>'
        f' <span style="color:{SOFT}">{html.escape(what)}</span><br>{html.escape(title)}</p>'
    )


def render(user: User, d: digest_service.Digest) -> tuple[str, str]:
    """(html, plain text). Short, in the app's paper-and-ink style, with links into the app."""
    web = settings.web_url.rstrip("/")
    bill_url = lambda b: f"{web}/bill/{b.id}"  # noqa: E731
    parts: list[str] = []
    text: list[str] = [f"Your week in Congress, week of {d.week_start:%B %-d}", ""]

    def section(title: str):
        parts.append(f'<h2 style="font-size:16px;margin:24px 0 10px;border-top:1px solid {LINE};padding-top:16px">'
                     f"{title}</h2>")
        text.extend(["", title.upper()])

    if d.followed:
        section("Bills you follow that moved")
        for b, what in d.followed:
            parts.append(_bill_line(b.label, b.title, what, bill_url(b)))
            text.append(f"- {b.label}: {what}. {b.title} {bill_url(b)}")
    if d.votes:
        section("How your members voted")
        for rc in d.votes:
            chamber = "House" if rc.chamber == "house" else "Senate"
            who = "; ".join(f"{m.name}: {m.position}" for m in rc.your_members)
            line = f"{chamber}, {rc.question}{f' ({rc.measure})' if rc.measure else ''}. {rc.result}."
            parts.append(f'<p style="margin:0 0 14px">{html.escape(line)}<br>'
                         f'<span style="color:{SOFT}">{html.escape(who)}</span></p>')
            text.append(f"- {line} {who}")
    if d.passed:
        section("What Congress passed")
        for b, what in d.passed:
            parts.append(_bill_line(b.label, b.title, what, bill_url(b)))
            text.append(f"- {b.label}: {what}. {b.title} {bill_url(b)}")

    unsub = unsubscribe_url(user)
    body = "".join(parts)
    page = f"""<!doctype html><html><body style="margin:0;background:{PAPER}">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:{SERIF};font-size:15px;line-height:1.5;
color:{INK}">
<p style="margin:0;color:{SOFT};font-size:13px">PolitiKNOW · week of {d.week_start:%B %-d, %Y}</p>
<h1 style="font-size:22px;margin:6px 0 4px">Your week in Congress</h1>
{body}
<p style="margin:28px 0 0;border-top:1px solid {LINE};padding-top:16px">
<a href="{web}/digest" style="color:{INK}">Open your full recap</a></p>
<p style="color:{SOFT};font-size:12px;margin-top:24px">You asked for this weekly email in PolitiKNOW's settings.
Every item is picked by the same published rules for everyone; nothing is chosen by AI.
<a href="{unsub}" style="color:{SOFT}">Unsubscribe in one click</a>.</p>
</div></body></html>"""
    text += ["", f"Open your full recap: {web}/digest", f"Unsubscribe: {unsub}"]
    return page, "\n".join(text)


async def send(to: str, subj: str, html_body: str, text_body: str, unsubscribe: str) -> bool:
    if not settings.brevo_api_key:
        return False
    payload = {
        "sender": {"name": settings.email_from_name, "email": settings.email_from},
        "to": [{"email": to}],
        "subject": subj,
        "htmlContent": html_body,
        "textContent": text_body,
        "headers": {"List-Unsubscribe": f"<{unsubscribe}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
    }
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(BREVO_URL, json=payload, headers={"api-key": settings.brevo_api_key})
    if resp.status_code >= 300:
        log.warning("Recap email to user failed: %s %s", resp.status_code, resp.text[:200])
        return False
    return True


async def send_recaps(db: AsyncSession, sender=send) -> dict:
    """Emails this week's recap to everyone who opted in and hasn't had it yet, up to the daily cap.
    Run Saturday; Sunday's run finishes anyone past the cap. Empty recaps aren't sent."""
    if not settings.brevo_api_key and sender is send:
        return {"sent": 0, "skipped": "BREVO_API_KEY not set"}
    today = datetime.now(UTC).date()
    week_start, _ = digest_service.week_bounds(today)
    users = list(await db.scalars(
        select(User).where(
            User.recap_email.is_(True), User.email.is_not(None), User.display_name.is_not(None),
            or_(User.recap_sent_for.is_(None), User.recap_sent_for < week_start),
        ).order_by(User.created_at).limit(settings.email_daily_cap)
    ))
    sent = empty = failed = 0
    for user in users:
        d = await digest_service.build(db, user, today)
        user.recap_sent_for = week_start  # also for empty recaps, so they aren't rebuilt on Sunday
        if d.is_empty:
            empty += 1
            continue
        page, text = render(user, d)
        if await sender(user.email, subject(d), page, text, unsubscribe_url(user)):
            sent += 1
        else:
            failed += 1
            user.recap_sent_for = None  # try again on the next run
        await db.commit()
    await db.commit()
    return {"sent": sent, "empty": empty, "failed": failed}
