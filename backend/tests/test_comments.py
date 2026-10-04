from datetime import UTC, datetime

from sqlalchemy import select

from app.models import User
from app.services import llm, moderation
from tests.conftest import signup
from tests.factories import make_bill


async def test_threading_is_one_level(client, db):
    bill = await make_bill(db)
    h = await signup(client)
    top = (await client.post(f"/bills/{bill.id}/comments", json={"body": "top"}, headers=h)).json()
    reply = (await client.post(f"/bills/{bill.id}/comments",
                               json={"body": "reply", "parent_comment_id": top["id"]}, headers=h)).json()
    r = await client.post(f"/bills/{bill.id}/comments",
                          json={"body": "deep", "parent_comment_id": reply["id"]}, headers=h)
    assert r.status_code == 400

    tree = (await client.get(f"/bills/{bill.id}/comments", headers=h)).json()
    assert len(tree) == 1 and tree[0]["replies"][0]["body"] == "reply"
    assert (await client.get(f"/bills/{bill.id}", headers=h)).json()["comment_count"] == 2


async def test_comment_length_limit(client, db):
    bill = await make_bill(db)
    h = await signup(client)
    r = await client.post(f"/bills/{bill.id}/comments", json={"body": "x" * 2001}, headers=h)
    assert r.status_code == 422


async def test_account_age_gate(client, db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "comment_min_account_age_minutes", 60)
    bill = await make_bill(db)
    h = await signup(client)
    r = await client.post(f"/bills/{bill.id}/comments", json={"body": "hi"}, headers=h)
    assert r.status_code == 403


async def test_comment_rate_limit(client, db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "comments_per_hour", 2)
    bill = await make_bill(db)
    h = await signup(client)
    for i in range(2):
        assert (await client.post(f"/bills/{bill.id}/comments", json={"body": f"c{i}"}, headers=h)).status_code == 201
    assert (await client.post(f"/bills/{bill.id}/comments", json={"body": "c3"}, headers=h)).status_code == 429


async def test_three_reports_hide_comment(client, db):
    bill = await make_bill(db)
    author = await signup(client, "author")
    c = (await client.post(f"/bills/{bill.id}/comments", json={"body": "spicy"}, headers=author)).json()
    reporters = [await signup(client, f"rep{i}") for i in range(3)]
    for h in reporters[:2]:
        await client.post(f"/comments/{c['id']}/report", json={"category": "spam"}, headers=h)
        await client.post(f"/comments/{c['id']}/report", json={"category": "spam"}, headers=h)  # dupes ignored
    assert len((await client.get(f"/bills/{bill.id}/comments", headers=reporters[0])).json()) == 1
    await client.post(f"/comments/{c['id']}/report", json={"category": "harassment"}, headers=reporters[2])

    assert (await client.get(f"/bills/{bill.id}/comments", headers=reporters[0])).json() == []
    # The author still sees their own hidden comment.
    mine = (await client.get(f"/bills/{bill.id}/comments", headers=author)).json()
    assert mine[0]["is_hidden"] is True


async def test_duplicate_comment_across_bills_is_flagged(client, db):
    b1, b2 = await make_bill(db), await make_bill(db)
    h = await signup(client)
    await client.post(f"/bills/{b1.id}/comments", json={"body": "Call your rep!"}, headers=h)
    r = await client.post(f"/bills/{b2.id}/comments", json={"body": "call your rep! "}, headers=h)
    assert r.json()["is_flagged"] is True


async def test_ai_moderation_hides_severe_and_shadow_bans_repeat_offenders(client, db, monkeypatch):
    async def fake_moderate(text):
        return llm.ModerationResult(flagged=True, max_score=0.99)

    monkeypatch.setattr(llm, "moderate", fake_moderate)
    bill = await make_bill(db)
    h = await signup(client, "troll")
    viewer = await signup(client, "viewer")
    for i in range(3):
        c = (await client.post(f"/bills/{bill.id}/comments", json={"body": f"bad {i}"}, headers=h)).json()
        await moderation.moderate_comment(db, c["id"])

    troll = await db.scalar(select(User).where(User.display_name == "troll"))
    await db.refresh(troll)
    assert troll.is_shadow_banned
    # A new comment from a shadow-banned user is invisible to others but visible to them.
    await client.post(f"/bills/{bill.id}/comments", json={"body": "still here"}, headers=h)
    assert (await client.get(f"/bills/{bill.id}/comments", headers=viewer)).json() == []
    assert len((await client.get(f"/bills/{bill.id}/comments", headers=h)).json()) == 4


async def test_comment_votes(client, db):
    bill = await make_bill(db)
    a, b = await signup(client, "alpha"), await signup(client, "bravo")
    c = (await client.post(f"/bills/{bill.id}/comments", json={"body": "hi"}, headers=a)).json()
    r = await client.post(f"/comments/{c['id']}/vote", json={"value": 1}, headers=b)
    assert r.json() == {"net_score": 1, "my_vote": 1}


async def test_social_notification(client, db):
    from app.models import Bill
    from app.services import notify

    bill = await make_bill(db)
    fan, star = await signup(client, "fan"), await signup(client, "star")
    star_id = (await client.get("/users/me", headers=star)).json()["id"]
    await client.post(f"/users/{star_id}/follow", headers=fan)
    await client.post(f"/bills/{bill.id}/vote", json={"value": 1}, headers=fan)  # fan has interacted
    await client.post(f"/bills/{bill.id}/comments", json={"body": "hello"}, headers=star)

    actor = await db.scalar(select(User).where(User.display_name == "star"))
    await notify.notify_social(db, actor, await db.get(Bill, bill.id))
    await db.commit()
    notes = (await client.get("/notifications", headers=fan)).json()
    assert notes[0]["type"] == "social" and "@star" in notes[0]["title"]


async def test_quiet_hours():
    from app.services.notify import in_quiet_hours

    u = User(notification_preferences={"quiet_hours": {"start": "22:00", "end": "08:00", "tz": "UTC"}})
    assert in_quiet_hours(u, datetime(2026, 1, 1, 23, 0, tzinfo=UTC))
    assert in_quiet_hours(u, datetime(2026, 1, 1, 7, 59, tzinfo=UTC))
    assert not in_quiet_hours(u, datetime(2026, 1, 1, 12, 0, tzinfo=UTC))


async def test_daily_notification_cap(client, db):
    from app.services import notify

    await signup(client)
    user = await db.scalar(select(User))
    for _ in range(8):
        await notify.notify(db, [user], "new_bill", "t", "b", None)
        await db.flush()
    await db.commit()
    assert len((await client.get("/notifications", headers=await _h(client))).json()) == 5


async def _h(client):
    r = await client.post("/auth/login", json={"email": "tester@example.com", "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


