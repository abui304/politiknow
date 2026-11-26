from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app import jobs
from app.models import ActivityDay, Event, Notification, User
from app.redis_client import redis
from app.services.metrics import scorecard
from tests.conftest import signup


async def _user(db, name="tester"):
    return await db.scalar(select(User).where(User.display_name == name))


async def test_activity_day_and_platform_are_recorded(client, db):
    headers = await signup(client)
    await redis.flushdb()  # the activity touch is throttled; signing up already made one without a client
    await client.get("/users/me", headers={**headers, "X-Client": "ios"})
    user = await _user(db)
    day = await db.scalar(select(ActivityDay).where(ActivityDay.user_id == user.id))
    assert day.day == datetime.now(UTC).date()
    assert day.platform == "ios"


async def test_unknown_client_is_not_stored(client, db):
    headers = await signup(client)
    await client.get("/users/me", headers={**headers, "X-Client": "Mozilla/5.0 something"})
    user = await _user(db)
    day = await db.scalar(select(ActivityDay).where(ActivityDay.user_id == user.id))
    assert day.platform is None


async def test_a_long_gap_starts_a_new_visit(client, db):
    headers = await signup(client)
    user = await _user(db)
    earlier = datetime.now(UTC) - timedelta(hours=5)
    user.last_active_at = earlier
    await db.commit()
    await redis.flushdb()  # the touch is throttled; clear it as if 10 minutes had passed
    await client.get("/users/me", headers=headers)
    await db.refresh(user)
    assert abs((user.previous_visit_at - earlier).total_seconds()) < 1
    assert user.last_active_at > earlier


async def test_a_short_gap_is_the_same_visit(client, db):
    headers = await signup(client)
    user = await _user(db)
    user.last_active_at = datetime.now(UTC) - timedelta(minutes=20)
    await db.commit()
    await redis.flushdb()
    await client.get("/users/me", headers=headers)
    await db.refresh(user)
    assert user.previous_visit_at is None


async def test_opening_an_alert_records_when_and_where_once(client, db):
    headers = await signup(client)
    user = await _user(db)
    n = Notification(user_id=user.id, type="status_update", title="t", body="b")
    db.add(n)
    await db.commit()
    r = await client.post(f"/notifications/{n.id}/open", json={"channel": "push"}, headers=headers)
    assert r.status_code == 204
    await db.refresh(n)
    first = n.opened_at
    assert n.channel == "push" and n.is_read and first
    await client.post(f"/notifications/{n.id}/open", json={"channel": "in_app"}, headers=headers)
    await db.refresh(n)
    assert n.opened_at == first and n.channel == "push"


async def test_only_listed_events_are_accepted(client, db):
    headers = await signup(client)
    assert (await client.post("/events", json={"name": "recap_open"}, headers=headers)).status_code == 204
    r = await client.post("/events", json={"name": "searched_for_abortion"}, headers=headers)
    assert r.status_code == 422
    assert await db.scalar(select(Event.name)) == "recap_open"


async def test_prune_drops_events_past_the_limit(db, client):
    await signup(client)
    user = await _user(db)
    db.add_all([
        Event(user_id=user.id, day=date.today() - timedelta(days=500), name="share"),
        Event(user_id=user.id, day=date.today(), name="share"),
    ])
    await db.commit()
    await jobs.prune(db)
    assert len(list(await db.scalars(select(Event)))) == 1


async def test_scorecard_counts_actives_and_alert_opens(client, db):
    headers = await signup(client)
    await client.get("/users/me", headers=headers)
    user = await _user(db)
    db.add_all([
        Notification(user_id=user.id, type="status_update", title="t", body="b", opened_at=datetime.now(UTC)),
        Notification(user_id=user.id, type="status_update", title="t", body="b"),
        Notification(user_id=user.id, type="status_update", title="t", body="b", backfill=True),
    ])
    await db.commit()
    card = await scorecard(db)
    assert card.weekly_active == 1
    assert (card.alerts_opened, card.alerts_delivered) == (1, 2)  # backfilled alerts aren't "delivered"
    assert card.new_users == 1
    assert any("north star" in line for line in card.lines())


async def test_first_follow_fills_alerts_with_recent_activity(client, db):
    from tests.factories import make_bill

    bill = await make_bill(db)
    recent = (datetime.now(UTC) - timedelta(days=3)).date().isoformat()
    old = (datetime.now(UTC) - timedelta(days=90)).date().isoformat()
    bill.milestones = {"introduced": old, "in_committee": recent}
    bill.status = "in_committee"
    await db.commit()
    h = await signup(client, "newbie")
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    alerts = (await client.get("/notifications", headers=h)).json()
    assert len(alerts) == 1  # only the last 30 days
    a = alerts[0]
    assert a["backfill"] and a["is_read"]  # no unread badge for history
    assert a["title"].endswith("In committee")
    assert "Most bills never leave committee" in a["body"] and "Next: the full House votes on it." in a["body"]

    # Following again (or after unfollowing) doesn't add it twice.
    await client.delete(f"/bills/{bill.id}/follow", headers=h)
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    assert len((await client.get("/notifications", headers=h)).json()) == 1


async def test_quiet_bill_still_gets_a_where_it_stands_line(client, db):
    from tests.factories import make_bill

    bill = await make_bill(db)
    bill.latest_action_text = "Referred to the Committee on Energy and Commerce."
    await db.commit()
    h = await signup(client, "newbie")
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    [a] = (await client.get("/notifications", headers=h)).json()
    assert a["title"] == f"Following {bill.label}" and "Referred to the Committee" in a["body"]


async def test_status_alert_explains_the_step_and_whats_next(db, client):
    from app.services import notify
    from tests.factories import make_bill

    bill = await make_bill(db)
    h = await signup(client, "watcher")
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    bill.status = "passed_house"
    bill.latest_action_text = "On passage Passed by the Yeas and Nays: 218 - 210."
    await notify.notify_status_change(db, bill)
    await db.commit()
    [alert] = [a for a in (await client.get("/notifications", headers=h)).json() if not a["backfill"]]
    assert alert["title"] == f"{bill.label}: Passed House"
    assert alert["body"].startswith("A majority of the House voted for it. Next: the full Senate votes on it.")
    assert alert["body"].endswith("218 - 210.")


async def test_since_is_hidden_on_a_first_visit(client, db):
    h = await signup(client, "newbie")
    assert (await client.get("/users/me/since", headers=h)).json() == {"since": None, "items": []}


async def test_since_lists_followed_bills_and_topics(client, db):
    from tests.factories import make_bill

    followed = await make_bill(db, tags=("Health",), title="Followed")
    h = await signup(client, "reader", tags=("Health", "Energy"))
    await client.post(f"/bills/{followed.id}/follow", headers=h)
    user = await _user(db, "reader")
    user.previous_visit_at = datetime.now(UTC) - timedelta(days=2)
    followed.last_action_date = datetime.now(UTC) - timedelta(hours=5)
    followed.milestones = {"passed_house": date.today().isoformat()}
    followed.status = "passed_house"
    await db.commit()
    await make_bill(db, tags=("Health",))  # new on a followed topic
    await make_bill(db, tags=("Energy",))
    await make_bill(db, tags=("Taxation",))  # not followed

    out = (await client.get("/users/me/since", headers=h)).json()
    kinds = [i["kind"] for i in out["items"]]
    assert kinds == ["bills", "topics"]
    assert out["items"][0]["text"] == f"{followed.label} passed the House"
    assert out["items"][0]["bill_id"] == str(followed.id)
    assert out["items"][1]["text"] == "3 new bills in Health and Energy"  # the followed one counts too
    assert out["items"][1]["tag"] == "Health"
