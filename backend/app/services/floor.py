"""This week's floor schedule for both chambers, from free public sources (no key needed):

- House: the Majority Leader's weekly "Bills this Week" XML on docs.house.gov, one file per week
  (named by its Monday), published the week before. It lists bills, not days.
- Senate: the floor schedule page on senate.gov, which says when the Senate next meets and what it
  will take up. There's no item-by-item feed, so bill numbers are picked out of its text.

Parsed schedules are cached in Redis for an hour.
"""

import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from bs4 import BeautifulSoup
from redis.asyncio import Redis

from app.models import BILL_TYPE_NAMES, bill_label

log = logging.getLogger(__name__)

HOUSE_XML = "https://docs.house.gov/billsthisweek/{d}/{d}.xml"
HOUSE_PAGE = "https://docs.house.gov/floor/Default.aspx?date={iso}"
SENATE_PAGE = "https://www.senate.gov/legislative/schedule/floor_schedule.htm"
CACHE_SECONDS = 3600
EASTERN = ZoneInfo("America/New_York")

# "H.R. 2066", "S. 12", "H.J.Res. 5", "S.Con.Res. 3" (not the "S." in "U.S." or the end of a sentence).
BILL_REF = re.compile(
    r"(?<![A-Za-z.])(H\.\s?R\.|H\.\s?Res\.|H\.\s?J\.\s?Res\.|H\.\s?Con\.\s?Res\.|"
    r"S\.\s?Res\.|S\.\s?J\.\s?Res\.|S\.\s?Con\.\s?Res\.|S\.)\s?(\d{1,5})\b"
)
# The House's category names, shortened for a phone.
CATEGORIES = {
    "items that may be considered under suspension of the rules": "Under suspension of the rules",
    "items that may be considered pursuant to a rule": "Under a rule",
}


def bill_key(label: str) -> tuple[str, int] | None:
    """("HR", 2066) for "H.R. 2066"."""
    m = re.fullmatch(r"\s*([A-Za-z. ]+?)\s*(\d+)\s*", label)
    if not m:
        return None
    kind = re.sub(r"[^A-Za-z]", "", m[1]).upper()
    return (kind, int(m[2])) if kind in BILL_TYPE_NAMES else None


def bill_refs(text: str) -> list[str]:
    """Bill numbers in free text, as labels ("H.R. 2066"), in order, without repeats."""
    seen: dict[str, None] = {}
    for kind, number in BILL_REF.findall(text):
        if key := bill_key(f"{kind} {number}"):
            seen[bill_label(*key)] = None
    return list(seen)


def week_of(today: date) -> date:
    return today - timedelta(days=today.weekday())


def parse_house(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    items = []
    for category in root.iter("category"):
        heading = category.get("type") or "On the floor"
        heading = CATEGORIES.get(heading.lower(), heading)
        for item in category.iter("floor-item"):
            if item.get("remove-date"):
                continue
            label = " ".join((item.findtext("legis-num") or "").split())
            text = " ".join((item.findtext("floor-text") or "").split())
            # A rule (H.Res.) lists the bills it brings to the floor in its text; link those too.
            labels = bill_refs(f"{label} {text}")
            items.append({"day": None, "heading": heading, "text": text or label, "bills": labels})
    return items


def _parse_day(text: str) -> date | None:
    for fmt in ("%A, %b %d, %Y", "%A, %B %d, %Y"):
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            pass
    return None


def parse_senate(html: str) -> list[dict]:
    """The next and previous meetings from the Senate's floor schedule page."""
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for article_id, label in (("proceedings_schedule_2", "Last met"), ("proceedings_schedule", "Next meeting")):
        article = soup.find("article", id=article_id)
        span = article.find("span", class_="floor-schedule") if article else None
        if not span:
            continue
        strong = span.find("strong")
        heading_text = (strong.get_text() if strong else (article.find("h3") or span).get_text()).strip()
        if strong:
            strong.extract()
        text = " ".join(span.get_text(" ").split())
        if not text:
            continue
        items.append({
            "day": (d.isoformat() if (d := _parse_day(heading_text)) else None),
            "heading": f"{label}: {heading_text}" if _parse_day(heading_text) else label,
            "text": text,
            "bills": bill_refs(text),
        })
    return items


async def _fetch(http: httpx.AsyncClient, url: str) -> str | None:
    try:
        r = await http.get(url, follow_redirects=True)
    except httpx.HTTPError as e:
        log.warning("Floor schedule fetch failed for %s: %s", url, e)
        return None
    # docs.house.gov answers a missing week with a 404 page.
    return r.text if r.status_code == 200 and "404 - File or directory not found" not in r.text else None


async def this_week(redis: Redis, today: date | None = None) -> dict:
    """{week_of, house: [...], senate: [...]} with bills as labels. If this week's House file isn't out
    (or the House is out), next week's is used once it's published."""
    today = today or datetime.now(EASTERN).date()
    monday = week_of(today)
    key = f"floor:{monday.isoformat()}"
    if cached := await redis.get(key):
        return json.loads(cached)

    house: list[dict] = []
    house_week = monday
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "PolitiKNOW"}) as http:
        for candidate in (monday, monday + timedelta(days=7)):
            d = candidate.strftime("%Y%m%d")
            if xml_text := await _fetch(http, HOUSE_XML.format(d=d)):
                try:
                    house, house_week = parse_house(xml_text), candidate
                    break
                except ET.ParseError:
                    log.warning("Unreadable House floor file for %s", d)
        senate_html = await _fetch(http, SENATE_PAGE)
    senate = parse_senate(senate_html) if senate_html else []

    data = {
        "week_of": monday.isoformat(),
        "house_week_of": house_week.isoformat(),
        "house": house,
        "senate": senate,
        "house_url": HOUSE_PAGE.format(iso=house_week.isoformat()),
        "senate_url": SENATE_PAGE,
    }
    await redis.set(key, json.dumps(data), ex=CACHE_SECONDS)
    return data
