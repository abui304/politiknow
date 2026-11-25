"""BlurHash placeholders for legislator photos.

A BlurHash is a ~30-character string describing a blurred version of an image. The app draws it instantly
while the real photo downloads, so portraits fade in from a soft color field instead of an empty box.
Computing one costs one image download (from Congress.gov's photo CDN, free) and a few milliseconds.
"""

import io
import logging

import blurhash
import httpx
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Legislator

log = logging.getLogger(__name__)

# Portraits are 4:5, so 4 by 5 components keep the face's rough shape and colors.
X_COMPONENTS, Y_COMPONENTS = 4, 5


def encode_image(data: bytes) -> str:
    """BlurHash of an image file's bytes. Shrinks it first: the hash only needs a tiny thumbnail."""
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGB")
        img.thumbnail((40, 50))
        return blurhash.encode(img, x_components=X_COMPONENTS, y_components=Y_COMPONENTS)


async def fetch_image(client: httpx.AsyncClient, url: str) -> bytes:
    res = await client.get(url, follow_redirects=True, timeout=20)
    res.raise_for_status()
    return res.content


async def backfill(db: AsyncSession, limit: int | None = None) -> int:
    """Adds a BlurHash to legislators that have a photo but no hash yet. Returns how many were added.
    A photo that fails to download or decode is skipped and tried again next run."""
    stmt = select(Legislator).where(Legislator.image_url.is_not(None), Legislator.image_blurhash.is_(None))
    if limit:
        stmt = stmt.limit(limit)
    done = 0
    async with httpx.AsyncClient() as client:
        for legislator in await db.scalars(stmt):
            try:
                legislator.image_blurhash = encode_image(await fetch_image(client, legislator.image_url))
                done += 1
            except Exception as e:  # noqa: BLE001 - one bad photo shouldn't stop the rest
                log.warning("blurhash skipped for %s: %s", legislator.bioguide_id, e)
    await db.commit()
    return done
