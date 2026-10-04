"""GPT-4o-mini summarization, tagging, and comment moderation (spec 2.2, 2.3, 7.1, 14.2).

Without OPENAI_API_KEY the app still runs: summaries fall back to an excerpt of the bill
text (clearly labeled), tagging falls back to the official policy area, and moderation is skipped.
"""

import json
import logging
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.config import settings
from app.taxonomy import POLICY_AREAS

log = logging.getLogger(__name__)

SIMPLE_PROMPT = (
    "You are a legislative analyst writing for a general audience with no political background. "
    "Summarize the following bill in plain, simple English using short sentences and common words. "
    "Explain what the bill would actually do and how it might affect everyday people. "
    "Avoid all legal jargon. Target length: 150-250 words."
)

DETAILED_PROMPT = (
    "You are a legislative analyst writing for an engaged, politically aware audience. "
    "Summarize the following bill with appropriate nuance, including key provisions, notable "
    "exceptions, funding mechanisms, and relevant context. Use clear language but preserve "
    "important specifics. Target length: 400-600 words."
)

TAG_PROMPT = (
    "You are a legislative classifier. Given the following bill text, return a JSON object with: "
    "(1) 'primary_tags': an array of 1-3 tags from this exact list: [{tags}], and "
    "(2) 'sub_tags': an array of 3-5 specific keywords capturing entities, locations, or narrow "
    "topics mentioned in the bill (e.g., 'Texas', 'Bridges', 'Insulin pricing'). "
    "Return only valid JSON, no other text."
)

HASHTAG_GUIDANCE = (
    " For sub_tags, avoid words true of almost every bill (e.g. 'Congress', 'House of Representatives',"
    " 'resolution', 'United States Code'). When one of these existing keywords fits the bill, reuse it"
    " exactly as written so bills can be found together: [{known}]"
)

NEUTRALITY = " Stay strictly neutral: do not take a side or describe the bill as good or bad."


def _client() -> AsyncOpenAI | None:
    return AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


def _bill_input(title: str, text: str) -> str:
    return f"Title: {title}\n\n{text[: settings.max_bill_chars_for_llm]}"


async def _chat(system: str, user: str, *, json_mode: bool = False) -> str:
    client = _client()
    assert client
    resp = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
        response_format={"type": "json_object"} if json_mode else None,
    )
    return (resp.choices[0].message.content or "").strip()


def _fallback_excerpt(text: str, words: int) -> str:
    excerpt = " ".join(text.split()[:words])
    return f"[AI summary unavailable — showing an excerpt of the bill text]\n\n{excerpt}…"


async def summarize(title: str, text: str) -> tuple[str, str]:
    """Returns (simple, detailed). Two sequential calls, per spec 3.3 step 4."""
    if not _client():
        return _fallback_excerpt(text, 120), _fallback_excerpt(text, 400)
    body = _bill_input(title, text)
    simple = await _chat(SIMPLE_PROMPT + NEUTRALITY, body)
    detailed = await _chat(DETAILED_PROMPT + NEUTRALITY, body)
    return simple, detailed


@dataclass
class Tags:
    primary: list[str]
    sub: list[str]


async def generate_tags(
    title: str, text: str, official_policy_area: str | None, known_hashtags: list[str] = ()
) -> Tags:
    """Official policyArea is ground truth; the LLM adds extra primary tags and sub-tags.

    `known_hashtags` (most common first) are offered for reuse so hashtags repeat across bills.
    """
    official = [official_policy_area] if official_policy_area in POLICY_AREAS else []
    if not _client():
        return Tags(primary=official, sub=[])
    try:
        system = TAG_PROMPT.format(tags=", ".join(POLICY_AREAS))
        system += HASHTAG_GUIDANCE.format(known=", ".join(known_hashtags[:200]))
        raw = await _chat(system, _bill_input(title, text), json_mode=True)
        data = json.loads(raw)
    except Exception as e:  # tagging failure shouldn't block ingestion
        log.warning("Tag generation failed for %r: %s", title, e)
        return Tags(primary=official, sub=[])
    llm_primary = [t for t in data.get("primary_tags", []) if t in POLICY_AREAS]
    primary = list(dict.fromkeys(official + llm_primary))[:3]
    sub = [str(s) for s in data.get("sub_tags", [])]
    return Tags(primary=primary, sub=sub)


@dataclass
class ModerationResult:
    flagged: bool
    max_score: float


async def moderate(text: str) -> ModerationResult | None:
    """OpenAI's moderation endpoint (free to use). None when no API key is configured."""
    client = _client()
    if not client:
        return None
    resp = await client.moderations.create(model="omni-moderation-latest", input=text)
    result = resp.results[0]
    scores = result.category_scores.model_dump()
    return ModerationResult(
        flagged=result.flagged,
        max_score=max((v for v in scores.values() if isinstance(v, (int, float))), default=0.0),
    )
