from app.idempotency import IdempotencyMiddleware  # noqa: F401 - the middleware under test
from app.redis_client import redis
from tests.conftest import signup
from tests.factories import make_bill


async def test_same_key_posts_one_comment_and_replays_the_response(client, db):
    bill = await make_bill(db)
    h = await signup(client)
    keyed = {**h, "Idempotency-Key": "comment-1"}
    first = await client.post(f"/bills/{bill.id}/comments", json={"body": "hello"}, headers=keyed)
    again = await client.post(f"/bills/{bill.id}/comments", json={"body": "hello"}, headers=keyed)
    assert first.status_code == again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert again.headers["idempotent-replayed"] == "true"
    assert len((await client.get(f"/bills/{bill.id}/comments", headers=h)).json()) == 1


async def test_different_keys_and_no_key_run_each_time(client, db):
    bill = await make_bill(db)
    h = await signup(client)
    await client.post(f"/bills/{bill.id}/comments", json={"body": "a"}, headers={**h, "Idempotency-Key": "k1"})
    await client.post(f"/bills/{bill.id}/comments", json={"body": "a"}, headers={**h, "Idempotency-Key": "k2"})
    await client.post(f"/bills/{bill.id}/comments", json={"body": "a"}, headers=h)
    assert len((await client.get(f"/bills/{bill.id}/comments", headers=h)).json()) == 3


async def test_key_reused_with_a_different_body_is_rejected(client, db):
    bill = await make_bill(db)
    h = {**(await signup(client)), "Idempotency-Key": "same"}
    await client.post(f"/bills/{bill.id}/comments", json={"body": "one"}, headers=h)
    r = await client.post(f"/bills/{bill.id}/comments", json={"body": "two"}, headers=h)
    assert r.status_code == 422


async def test_keys_are_per_user(client, db):
    bill = await make_bill(db)
    alice = {**(await signup(client, "alice")), "Idempotency-Key": "shared"}
    bob = {**(await signup(client, "bob")), "Idempotency-Key": "shared"}
    a = await client.post(f"/bills/{bill.id}/comments", json={"body": "hi"}, headers=alice)
    b = await client.post(f"/bills/{bill.id}/comments", json={"body": "hi"}, headers=bob)
    assert a.json()["id"] != b.json()["id"]
    assert "idempotent-replayed" not in b.headers


async def test_request_still_running_gets_409(client, db):
    bill = await make_bill(db)
    h = await signup(client)
    path = f"/bills/{bill.id}/comments"
    # Simulate a first attempt that's still in flight.
    keys_before = set(await redis.keys("idem:*"))
    await client.post(path, json={"body": "x"}, headers={**h, "Idempotency-Key": "busy"})
    (slot,) = set(await redis.keys("idem:*")) - keys_before
    import hashlib
    import json

    fp = hashlib.sha256(b'{"body":"x"}').hexdigest()
    await redis.set(slot, json.dumps({"state": "pending", "fp": fp}))
    retry = {**h, "Idempotency-Key": "busy", "Content-Type": "application/json"}
    r = await client.post(path, content=b'{"body":"x"}', headers=retry)
    assert r.status_code == 409


async def test_auth_endpoints_are_never_cached(client):
    body = {"email": "x@example.com", "password": "password123", "display_name": "xuser"}
    await client.post("/auth/register", json=body, headers={"Idempotency-Key": "reg"})
    assert not await redis.keys("idem:*")
