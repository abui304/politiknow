"""Thin client for api.congress.gov (spec 14.1), with retry + exponential backoff (spec 13)."""

import asyncio
import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup

from app.config import settings

log = logging.getLogger(__name__)
BASE = "https://api.congress.gov/v3"


class CongressClient:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self.http = client or httpx.AsyncClient(timeout=30)

    async def close(self) -> None:
        await self.http.aclose()

    async def _get(self, url: str, params: dict | None = None, *, raw: bool = False) -> Any:
        params = {**(params or {})}
        if url.startswith(BASE):
            params |= {"api_key": settings.congress_api_key, "format": "json"}
        for attempt in range(4):
            try:
                resp = await self.http.get(url, params=params)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise httpx.HTTPStatusError("retryable", request=resp.request, response=resp)
                resp.raise_for_status()
                return resp.text if raw else resp.json()
            except (httpx.TransportError, httpx.HTTPStatusError) as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status and status < 500 and status != 429 or attempt == 3:
                    raise
                wait = 2**attempt
                log.warning("Congress API %s failed (%s), retrying in %ss", url, status or e, wait)
                await asyncio.sleep(wait)

    async def list_updated_bills(self, from_iso: str, to_iso: str, offset: int, limit: int) -> tuple[list[dict], int]:
        """One page of current-Congress bills updated in [from_iso, to_iso], oldest first.

        Returns (bills, total in window). The window is fixed so offsets stay stable across runs.
        """
        bills: list[dict] = []
        total = 0
        while len(bills) < limit:
            data = await self._get(
                f"{BASE}/bill/{settings.congress_number}",
                {
                    "fromDateTime": from_iso,
                    "toDateTime": to_iso,
                    # A literal space: httpx sends "+" as %2B, which the API silently ignores.
                    "sort": "updateDate asc",
                    "offset": offset + len(bills),
                    "limit": min(limit - len(bills), 250),
                },
            )
            page = data.get("bills", [])
            total = data.get("pagination", {}).get("count", 0)
            bills.extend(page)
            if not page or offset + len(bills) >= total:
                break
        return bills, total

    async def bill_detail(self, congress: int, bill_type: str, number: int) -> dict:
        data = await self._get(f"{BASE}/bill/{congress}/{bill_type.lower()}/{number}")
        return data["bill"]

    async def latest_text(self, congress: int, bill_type: str, number: int) -> tuple[str, str] | None:
        """Returns (version_type, plain_text) for the newest text version, or None if not published yet."""
        data = await self._get(f"{BASE}/bill/{congress}/{bill_type.lower()}/{number}/text")
        versions = data.get("textVersions") or []
        # Undated versions (e.g. enrolled bills) are the newest; otherwise sort by date.
        versions.sort(key=lambda v: v.get("date") or "9999", reverse=True)
        for version in versions:
            for fmt in version.get("formats", []):
                if fmt.get("type") == "Formatted Text":
                    html = await self._get(fmt["url"], raw=True)
                    text = BeautifulSoup(html, "html.parser").get_text("\n")
                    return version.get("type") or "", _squash_blank_lines(text)
        return None


def _squash_blank_lines(text: str) -> str:
    lines = [line.rstrip() for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return "\n".join(out).strip()


def status_from_action(action_text: str | None) -> str:
    """Rough lifecycle stage from the latest action's text."""
    t = (action_text or "").lower()
    if "became public law" in t or "became private law" in t:
        return "became_law"
    if "vetoed" in t:
        return "vetoed"
    if "presented to president" in t or "signed by president" in t:
        return "to_president"
    if "passed senate" in t or "passed/agreed to in senate" in t:
        return "passed_senate"
    if "passed house" in t or "passed/agreed to in house" in t or "on passage passed" in t:
        return "passed_house"
    if "committee" in t or "referred to" in t or "subcommittee" in t:
        return "in_committee"
    return "introduced"
