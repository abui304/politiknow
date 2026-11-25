from tests.conftest import signup


async def test_register_login_refresh_logout(client):
    r = await client.post("/auth/register", json={
        "email": "A@Example.com", "password": "password123", "display_name": "alpha"})
    assert r.status_code == 201
    assert r.json()["needs_onboarding"] is True

    # Email is case-insensitive, and the password hash is checked (regression: old code double-hashed).
    r = await client.post("/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert r.status_code == 200
    tokens = r.json()

    r = await client.post("/auth/login", json={"email": "a@example.com", "password": "wrong"})
    assert r.status_code == 401

    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    # Refresh tokens rotate: the old one can't be reused.
    r2 = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 401

    new = r.json()
    await client.post("/auth/logout", json={"refresh_token": new["refresh_token"]})
    r = await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert r.status_code == 401


async def test_duplicate_email_and_display_name(client):
    await signup(client, "alpha", tags=None)
    r = await client.post("/auth/register", json={
        "email": "alpha@example.com", "password": "password123", "display_name": "other"})
    assert r.status_code == 409
    r = await client.post("/auth/register", json={
        "email": "new@example.com", "password": "password123", "display_name": "ALPHA"})
    assert r.status_code == 409


async def test_display_name_rules(client):
    for bad in ["ab", "x" * 31, "has space", "émoji"]:
        r = await client.post("/auth/register", json={
            "email": "z@example.com", "password": "password123", "display_name": bad})
        assert r.status_code == 422, bad


async def test_endpoints_require_auth(client):
    for path in ["/feed", "/users/me", "/tags", "/notifications"]:
        assert (await client.get(path)).status_code == 401


async def test_onboarding_topics_are_optional_but_valid(client):
    headers = await signup(client, tags=None)
    r = await client.patch("/users/me", json={"onboarding_tags": ["Health", "Nope"]}, headers=headers)
    assert r.status_code == 422
    from app.taxonomy import POLICY_AREAS

    r = await client.patch("/users/me", json={"onboarding_tags": POLICY_AREAS[:11]}, headers=headers)
    assert r.status_code == 422
    # Skipping (no topics) finishes onboarding: signing in again doesn't ask again.
    assert (await client.patch("/users/me", json={"onboarding_tags": []}, headers=headers)).status_code == 200
    r = await client.post("/auth/login", json={"email": "tester@example.com", "password": "password123"})
    assert r.json()["needs_onboarding"] is False


async def test_google_disabled_without_client_id(client):
    r = await client.post("/auth/google", json={"id_token": "x"})
    assert r.status_code == 501


async def test_delete_account_removes_everything_and_fixes_counts(client, db):
    from app.models import Bill, User
    from tests.factories import make_bill

    bill = await make_bill(db)
    me = await signup(client, "leaver")
    other = await signup(client, "stayer")
    await client.post(f"/bills/{bill.id}/vote", json={"value": 1}, headers=me)
    await client.post(f"/bills/{bill.id}/vote", json={"value": 1}, headers=other)
    await client.post(f"/bills/{bill.id}/comments", json={"body": "bye"}, headers=me)

    assert (await client.delete("/users/me", headers=me)).status_code == 204
    assert (await client.get("/users/me", headers=me)).status_code == 401
    await db.refresh(await db.get(Bill, bill.id))
    fresh = await db.get(Bill, bill.id)
    assert fresh.net_score == 1 and fresh.comment_count == 0
    from sqlalchemy import select

    assert await db.scalar(select(User).where(User.display_name == "leaver")) is None
