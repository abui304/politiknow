import os

os.environ["DATABASE_URL"] = "postgresql+asyncpg://localhost/politiknow_test"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["OPENAI_API_KEY"] = ""
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["COMMENT_MIN_ACCOUNT_AGE_MINUTES"] = "0"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.redis_client import redis  # noqa: E402
from app.routers import comments  # noqa: E402


@pytest.fixture(autouse=True)
async def clean_state(monkeypatch):
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await redis.flushdb()
    monkeypatch.setattr(comments, "_enqueue", lambda *a: None)  # no Celery worker in tests
    yield


@pytest.fixture
async def db():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def signup(client, name="tester", tags=("Health", "Taxation", "Education", "Energy", "Immigration")):
    r = await client.post("/auth/register", json={
        "email": f"{name}@example.com", "password": "password123", "display_name": name})
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if tags:
        r = await client.patch("/users/me", json={"onboarding_tags": list(tags)}, headers=headers)
        assert r.status_code == 200, r.text
    return headers
