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


async def test_onboarding_requires_5_to_10_valid_tags(client):
    headers = await signup(client, tags=None)
    r = await client.patch("/users/me", json={"onboarding_tags": ["Health"]}, headers=headers)
    assert r.status_code == 422
    r = await client.patch("/users/me", json={"onboarding_tags": ["Health", "Nope", "Law", "Energy", "Animals"]},
                           headers=headers)
    assert r.status_code == 422


async def test_google_disabled_without_client_id(client):
    r = await client.post("/auth/google", json={"id_token": "x"})
    assert r.status_code == 501
