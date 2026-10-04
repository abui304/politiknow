"""Ingestion against a fake Congress API (no network, no OpenAI)."""

from sqlalchemy import select

from app.models import Bill, Notification
from app.services.congress import status_from_action
from app.services.ingest import run_ingestion
from tests.conftest import signup


class FakeCongress:
    def __init__(self):
        self.text: dict[int, str | None] = {1: "Section 1. Insulin costs capped.", 2: None}
        self.action = "Referred to the Committee on Energy and Commerce."

    async def list_updated_bills(self, since, limit):
        return [{"congress": 119, "type": "HR", "number": "1"}, {"congress": 119, "type": "S", "number": "2"}]

    async def bill_detail(self, congress, bill_type, number):
        return {
            "title": f"Bill {number}", "introducedDate": "2026-09-01",
            "policyArea": {"name": "Health"},
            "sponsors": [{"bioguideId": "X1", "fullName": "Rep. Someone [D-CA-1]", "party": "D"}],
            "latestAction": {"actionDate": "2026-09-02", "text": self.action},
            "legislationUrl": "https://congress.gov/x",
        }

    async def latest_text(self, congress, bill_type, number):
        t = self.text[number]
        return ("Introduced", t) if t else None


async def test_ingestion_pipeline(client, db):
    await signup(client, "healthfan")  # follows Health via onboarding tags
    api = FakeCongress()

    assert await run_ingestion(db, api) == {"ok": 2, "failed": 0}
    bills = {b.bill_number: b for b in await db.scalars(select(Bill))}
    assert bills[1].is_published and bills[1].status == "in_committee"
    assert bills[1].primary_tags == ["Health"] and bills[1].sponsor_party == "D"
    assert "excerpt" in bills[1].summary_simple  # no OpenAI key -> labeled fallback
    assert not bills[2].is_published  # no text yet
    assert (await db.scalar(select(Notification).where(Notification.type == "new_bill"))) is not None

    # Second run: text arrives for bill 2, status changes on bill 1.
    api.text[2] = "Now with text."
    api.action = "Passed House by recorded vote."
    await signup(client, "voter")
    await run_ingestion(db, api)
    await db.refresh(bills[1])
    await db.refresh(bills[2])
    assert bills[2].is_published
    assert bills[1].status == "passed_house"


def test_status_from_action():
    assert status_from_action("Became Public Law No: 119-5.") == "became_law"
    assert status_from_action("Passed Senate without amendment by Unanimous Consent.") == "passed_senate"
    assert status_from_action("Referred to the House Committee on Ways and Means.") == "in_committee"
    assert status_from_action(None) == "introduced"
