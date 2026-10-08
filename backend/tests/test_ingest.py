"""Ingestion against a fake Congress API (no network, no OpenAI)."""

from sqlalchemy import select

from app.config import settings
from app.models import Bill, Notification
from app.services.ingest import run_ingestion
from tests.conftest import signup


class FakeCongress:
    def __init__(self):
        self.text: dict[int, str | None] = {1: "Section 1. Insulin costs capped.", 2: None}
        self.action = "Referred to the Committee on Energy and Commerce."

    async def list_updated_bills(self, from_iso, to_iso, offset, limit):
        bills = [{"congress": 119, "type": "HR", "number": "1"}, {"congress": 119, "type": "S", "number": "2"}]
        return bills[offset : offset + limit], len(bills)

    async def bill_detail(self, congress, bill_type, number):
        return {
            "title": f"Bill {number}", "introducedDate": "2026-09-01",
            "policyArea": {"name": "Health"},
            "sponsors": [{"bioguideId": "X1", "fullName": "Rep. Someone [D-CA-1]", "party": "D"}],
            "latestAction": {"actionDate": "2026-09-02", "text": self.action},
            "legislationUrl": "https://congress.gov/x",
        }

    async def actions(self, congress, bill_type, number):
        actions = [
            {"actionDate": "2026-09-01", "type": "IntroReferral", "actionCode": "1000", "text": "Introduced in House"},
            {"actionDate": "2026-09-02", "type": "IntroReferral",
             "text": "Referred to the Committee on Energy and Commerce."},
        ]
        if "Passed House" in self.action:
            actions.append({"actionDate": "2026-09-20", "type": "Floor", "actionCode": "8000",
                            "text": f"Passed/agreed to in House: {self.action}"})
        return actions

    async def member(self, bioguide_id):
        return {"state": "California", "currentMember": True,
                "depiction": {"imageUrl": f"https://img/{bioguide_id}.jpg", "attribution": "<a href='x'>Courtesy</a>"},
                "terms": [{"chamber": "House of Representatives", "startYear": 2025, "endYear": 2027}],
                "addressInformation": {"officeAddress": "1 Longworth House Office Building", "zipCode": 20515,
                                       "phoneNumber": "(202) 225-0000"}}

    async def current_members(self, congress):
        return []

    async def latest_text(self, congress, bill_type, number):
        t = self.text[number]
        return ("Introduced", t) if t else None


async def test_ingestion_pipeline(client, db):
    await signup(client, "healthfan")  # follows Health via onboarding tags
    api = FakeCongress()

    result = await run_ingestion(db, api)
    assert (result["new"], result["waiting"], result["failed"], result["backlog_remaining"]) == (1, 1, 0, 0)
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


class BigBacklogCongress(FakeCongress):
    """7 updated bills in the window; every one has text."""

    def __init__(self):
        super().__init__()
        self.text = {n: f"Text of bill {n}" for n in range(1, 8)}
        self.listed_calls = []

    async def list_updated_bills(self, from_iso, to_iso, offset, limit):
        self.listed_calls.append((from_iso, to_iso, offset))
        bills = [{"congress": 119, "type": "HR", "number": str(n)} for n in range(1, 8)]
        return bills[offset : offset + limit], len(bills)


async def test_capped_runs_resume_without_skipping_or_repeating(db, monkeypatch):
    """Regression: a capped run used to mark the whole window done and skip the rest."""
    from app.services import ingest

    monkeypatch.setattr(settings, "ingest_max_bills_per_run", 3)
    monkeypatch.setattr(ingest, "RESUME_OVERLAP", 1)
    api = BigBacklogCongress()

    runs = [await run_ingestion(db, api) for _ in range(3)]
    assert [r["new"] for r in runs] == [3, 3, 1]
    assert [r["backlog_remaining"] for r in runs] == [4, 1, 0]
    assert len(set(await db.scalars(select(Bill.bill_number)))) == 7

    # All three runs walked the same fixed window, each re-reading 1 bill before its saved position.
    assert [c[2] for c in api.listed_calls] == [0, 2, 5]
    assert [r["refreshed"] for r in runs] == [0, 1, 1]  # the overlap re-reads, never re-summarized
    assert len({c[:2] for c in api.listed_calls}) == 1

    # The next run opens a new window starting where the last one ended.
    await run_ingestion(db, api)
    assert api.listed_calls[-1][0] == api.listed_calls[0][1]
    assert api.listed_calls[-1][2] == 0
