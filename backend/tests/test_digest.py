from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.models import User
from app.services import email, votes
from app.services.digest import build, week_bounds
from tests.conftest import signup
from tests.factories import make_bill
from tests.test_votes import FakeVotes, _members

TODAY = datetime.now(UTC).date()
START, _ = week_bounds(TODAY)


async def _user(db, name):
    return await db.scalar(select(User).where(User.display_name == name))


async def _moved_this_week(db, bill, stage="passed_house"):
    bill.milestones = {stage: START.isoformat()}
    bill.status = stage
    bill.last_action_date = datetime.combine(START, datetime.min.time(), UTC) + timedelta(hours=12)
    await db.commit()


async def test_recap_follows_the_published_order(client, db):
    await _members(db)
    followed = await make_bill(db, title="Followed Bill")
    passed = await make_bill(db, title="Passed Elsewhere", party="R")
    quiet = await make_bill(db, title="Quiet Bill", days_ago=40)
    await _moved_this_week(db, followed)
    await _moved_this_week(db, passed, "passed_senate")
    h = await signup(client, "reader")
    user = await _user(db, "reader")
    user.home_state, user.home_district = "WA", 8
    await db.commit()
    for b in (followed, quiet):
        await client.post(f"/bills/{b.id}/follow", headers=h)
    await votes.sync_votes(db, FakeVotes(followed.bill_number), congress=119, session=2)

    out = (await client.get("/digest", headers=h)).json()
    assert out["week_start"] == START.isoformat()
    assert [(b["title"], b["what"]) for b in out["followed"]] == [("Followed Bill", "Passed House")]
    assert [b["title"] for b in out["passed"]] == ["Passed Elsewhere"]  # a followed bill isn't listed twice
    assert out["votes"] and all(v["kind"] in ("passage", "cloture") for v in out["votes"])
    assert not out["is_empty"]

    d = await build(db, user, TODAY)
    assert d.party_mix == {"D": 1, "R": 1}


async def test_a_quiet_week_is_empty(client, db):
    h = await signup(client, "reader")
    out = (await client.get("/digest", headers=h)).json()
    assert out["is_empty"] and out["followed"] == [] and out["passed"] == []


async def test_recap_email_opt_in_send_once_and_unsubscribe(client, db, monkeypatch):
    bill = await make_bill(db, title="Moved Bill")
    await _moved_this_week(db, bill)
    h = await signup(client, "reader")
    await signup(client, "not_opted_in")
    await client.post(f"/bills/{bill.id}/follow", headers=h)

    me = (await client.patch("/users/me", json={"recap_email": True}, headers=h)).json()
    assert me["recap_email"] is True
    user = await _user(db, "reader")
    await db.refresh(user)
    assert user.recap_token

    sent = []

    async def fake_send(to, subj, page, text, unsubscribe):
        sent.append((to, subj, page, text, unsubscribe))
        return True

    result = await email.send_recaps(db, sender=fake_send)
    assert result == {"sent": 1, "empty": 0, "failed": 0}
    to, subj, page, text, unsub = sent[0]
    assert to == "reader@example.com"
    assert subj == "Your week in Congress: 1 bill you follow moved"
    assert "Moved Bill" in page and "Moved Bill" in text and "<img" not in page  # no tracking pixel
    assert unsub.endswith(f"/recap/unsubscribe?token={user.recap_token}")

    # Sunday's run doesn't send it again.
    assert (await email.send_recaps(db, sender=fake_send))["sent"] == 0

    token = user.recap_token
    r = await client.get(f"/recap/unsubscribe?token={token}")
    assert r.status_code == 200 and "unsubscribed" in r.text
    await db.refresh(user)
    assert user.recap_email is False
    assert "didn't work" in (await client.get("/recap/unsubscribe?token=nope")).text


async def test_empty_recaps_are_not_emailed(client, db):
    h = await signup(client, "reader")
    await client.patch("/users/me", json={"recap_email": True}, headers=h)

    async def fake_send(*a):
        raise AssertionError("should not send")

    assert await email.send_recaps(db, sender=fake_send) == {"sent": 0, "empty": 1, "failed": 0}


async def test_failed_sends_are_retried(client, db):
    bill = await make_bill(db)
    await _moved_this_week(db, bill)
    h = await signup(client, "reader")
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    await client.patch("/users/me", json={"recap_email": True}, headers=h)

    async def failing(*a):
        return False

    assert (await email.send_recaps(db, sender=failing))["failed"] == 1
    user = await _user(db, "reader")
    await db.refresh(user)
    assert user.recap_sent_for is None


def test_week_bounds_start_on_monday():
    start, end = week_bounds(date(2026, 11, 26))  # a Thursday
    assert start == date(2026, 11, 23) and end == date(2026, 11, 30)
