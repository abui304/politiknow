import io

from PIL import Image
from sqlalchemy import select

from app.models import Legislator
from app.services import blurhash


def _portrait() -> bytes:
    img = Image.new("RGB", (200, 250), (60, 90, 160))
    img.paste((230, 200, 170), (60, 40, 140, 160))  # a face-ish block
    out = io.BytesIO()
    img.save(out, format="JPEG")
    return out.getvalue()


async def test_backfill_adds_placeholders_for_photos(db, monkeypatch):
    async def fake_fetch(_client, url):
        return _portrait()

    monkeypatch.setattr(blurhash, "fetch_image", fake_fetch)
    db.add_all([
        Legislator(bioguide_id="A1", full_name="Rep. A", image_url="https://img/a.jpg"),
        Legislator(bioguide_id="B2", full_name="Rep. B", image_url=None),
    ])
    await db.commit()
    assert await blurhash.backfill(db) == 1
    a = await db.scalar(select(Legislator).where(Legislator.bioguide_id == "A1"))
    assert a.image_blurhash and len(a.image_blurhash) == 44  # 4 x 5 components
    assert await blurhash.backfill(db) == 0  # already done


async def test_a_photo_that_fails_is_skipped(db):
    db.add(Legislator(bioguide_id="C3", full_name="Rep. C", image_url="https://img/c.jpg"))
    await db.commit()
    assert await blurhash.backfill(db) == 0  # conftest blocks the download


async def test_placeholder_is_served_with_legislators(client, db):
    hash_ = "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
    db.add(Legislator(bioguide_id="D4", full_name="Rep. D", image_url="https://img/d.jpg", image_blurhash=hash_))
    await db.commit()
    from tests.conftest import signup

    h = await signup(client)
    r = await client.get("/legislators/D4", headers=h)
    assert r.json()["image_blurhash"] == hash_
