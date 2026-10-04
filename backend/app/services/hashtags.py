"""Hashtags (the spec's LLM "sub-tags"): short keywords like "Texas" or "Insulin pricing".

To make them useful for search they need to repeat across bills, so new hashtags reuse an
existing spelling whenever one matches case-insensitively, and generic filler is dropped.
"""

import re
from collections import Counter, defaultdict

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bill

MAX_PER_BILL = 5

# True of nearly every bill, so useless for search.
GENERIC = {
    "congress", "bill", "bills", "act", "legislation", "law", "resolution", "resolutions",
    "house of representatives", "house", "senate", "united states", "united states code",
    "federal government", "one hundred nineteenth congress", "119th congress", "u.s. code",
}

# Every hashtag on a published bill, one row per (bill, hashtag).
_ALL_TAGS = (
    select(func.jsonb_array_elements_text(Bill.sub_tags).label("tag"))
    .where(Bill.is_published.is_(True))
    .subquery()
)


def clean(tag: str) -> str:
    return re.sub(r"\s+", " ", str(tag).strip().lstrip("#").strip())


def canonicalize(tags: list[str], vocab: dict[str, str]) -> list[str]:
    """Clean, drop generic words, reuse known spellings, de-duplicate. Updates `vocab` in place."""
    out: list[str] = []
    for raw in tags:
        tag = clean(raw)
        key = tag.lower()
        if not tag or key in GENERIC or len(tag) > 60:
            continue
        tag = vocab.setdefault(key, tag)
        if tag not in out:
            out.append(tag)
    return out[:MAX_PER_BILL]


async def vocabulary(db: AsyncSession) -> dict[str, str]:
    """lowercase -> preferred spelling (the most common one) for every hashtag in use,
    ordered most-used first."""
    rows = (await db.execute(select(_ALL_TAGS.c.tag, func.count()).group_by(_ALL_TAGS.c.tag))).all()
    spellings: dict[str, Counter] = defaultdict(Counter)
    for tag, n in rows:
        spellings[tag.lower()][tag] += n
    by_use = sorted(spellings.items(), key=lambda kv: -sum(kv[1].values()))
    # Ties go to the capitalized spelling ("Texas" over "texas"); hashtags are often proper nouns.
    return {key: max(counts, key=lambda t: (counts[t], t != t.lower(), t)) for key, counts in by_use}


async def popular(db: AsyncSession, limit: int = 30, min_bills: int = 2) -> list[tuple[str, int]]:
    rows = await db.execute(
        select(_ALL_TAGS.c.tag, func.count().label("n"))
        .group_by(_ALL_TAGS.c.tag)
        .having(func.count() >= min_bills)
        .order_by(text("n DESC"), _ALL_TAGS.c.tag)
        .limit(limit)
    )
    return [(tag, n) for tag, n in rows.all()]


async def normalize_all(db: AsyncSession) -> int:
    """One-off cleanup of existing bills (free: no AI calls). Returns bills changed."""
    vocab = await vocabulary(db)
    changed = 0
    for bill in await db.scalars(select(Bill).where(Bill.is_published.is_(True))):
        fixed = canonicalize(bill.sub_tags or [], vocab)
        if fixed != bill.sub_tags:
            bill.sub_tags = fixed
            changed += 1
    await db.commit()
    return changed
