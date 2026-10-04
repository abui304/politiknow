from datetime import UTC, datetime, timedelta

from app.models import User
from app.services import feed
from tests.conftest import signup
from tests.factories import make_bill


async def test_vote_flow_updates_net_score(client, db):
    bill = await make_bill(db)
    a = await signup(client, "alpha")
    b = await signup(client, "bravo")

    r = await client.post(f"/bills/{bill.id}/vote", json={"value": 1}, headers=a)
    assert r.json() == {"net_score": 1, "my_vote": 1}
    r = await client.post(f"/bills/{bill.id}/vote", json={"value": -1}, headers=b)
    assert r.json()["net_score"] == 0
    r = await client.post(f"/bills/{bill.id}/vote", json={"value": -1}, headers=a)  # flip
    assert r.json()["net_score"] == -2
    r = await client.post(f"/bills/{bill.id}/vote", json={"value": 0}, headers=a)  # clear
    assert r.json()["net_score"] == -1

    r = await client.get(f"/bills/{bill.id}", headers=b)
    assert r.json()["my_vote"] == -1
    assert r.json()["label"] == f"H.R. {bill.bill_number}"


async def test_unpublished_bills_are_hidden(client, db):
    bill = await make_bill(db)
    bill.is_published = False
    await db.commit()
    h = await signup(client)
    assert (await client.get(f"/bills/{bill.id}", headers=h)).status_code == 404


async def test_feed_prefers_user_tags_and_paginates(client, db):
    matching = await make_bill(db, tags=("Health",), days_ago=3)
    other = await make_bill(db, tags=("Animals",), days_ago=3)
    h = await signup(client)  # onboarding: Health, Taxation, Education, Energy, Immigration

    r = await client.get("/feed?limit=1", headers=h)
    page1 = r.json()
    assert page1["items"][0]["id"] == str(matching.id)
    assert page1["next_cursor"] == 1
    r = await client.get("/feed?limit=1&cursor=1", headers=h)
    assert r.json()["items"][0]["id"] == str(other.id)
    assert r.json()["next_cursor"] is None


def test_score_formula():
    from app.config import settings

    now = datetime.now(UTC)

    class B:
        id = "x"
        primary_tags = ["Health"]
        last_action_date = now - timedelta(days=settings.feed_recency_half_life_days)  # exactly one half-life
        is_trending = True

    s = feed.score(B, {"Health": 0.5}, {"x"}, now)
    assert abs(s - (0.5 * 0.45 + 0.5 * 0.25 + 1 * 0.20 + 1 * 0.10)) < 1e-6


async def test_search_by_tag_and_title(client, db):
    await make_bill(db, tags=("Health",), title="Insulin Price Cap Act")
    await make_bill(db, tags=("Energy",), title="Solar Grid Act")
    h = await signup(client)

    r = await client.get("/search", params={"tag": "Energy"}, headers=h)
    assert [b["title"] for b in r.json()["items"]] == ["Solar Grid Act"]
    r = await client.get("/search", params={"q": "insulin"}, headers=h)
    assert [b["title"] for b in r.json()["items"]] == ["Insulin Price Cap Act"]
    r = await client.get("/search", params={"q": "100%"}, headers=h)  # LIKE wildcards are literal
    assert r.json()["items"] == []


async def test_trending(client, db):
    from app.services import trending

    bill = await make_bill(db)
    h = await signup(client)
    await client.post(f"/bills/{bill.id}/comments", json={"body": "hi"}, headers=h)
    result = await trending.recalculate(db)
    assert result["trending"] == 1
    await db.refresh(bill)
    assert bill.is_trending and bill.trending_score == 3.0  # 1 comment * 3 / 1 active user


async def test_follow_and_profile(client, db):
    a = await signup(client, "alpha")
    await signup(client, "bravo")
    bravo = (await client.get("/users/me", headers=await _login(client, "bravo"))).json()

    r = await client.post(f"/users/{bravo['id']}/follow", headers=a)
    assert r.status_code == 204
    r = await client.get(f"/users/{bravo['id']}", headers=a)
    assert r.json()["follower_count"] == 1 and r.json()["is_following"]
    me = (await client.get("/users/me", headers=a)).json()
    assert (await client.post(f"/users/{me['id']}/follow", headers=a)).status_code == 400


async def _login(client, name):
    r = await client.post("/auth/login", json={"email": f"{name}@example.com", "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_incomplete_social_user_must_pick_display_name(client, db):
    from app.security import create_access_token

    user = User(email="g@example.com", auth_provider="google", social_provider_id="123")
    db.add(user)
    await db.commit()
    h = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    assert (await client.get("/feed", headers=h)).status_code == 403
    assert (await client.get("/users/me", headers=h)).status_code == 200
    r = await client.patch("/users/me", json={"display_name": "new_name"}, headers=h)
    assert r.json()["display_name"] == "new_name"
