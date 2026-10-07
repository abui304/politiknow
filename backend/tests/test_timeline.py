from datetime import date

from app import timeline
from tests.conftest import signup
from tests.factories import make_bill

# Trimmed from H.R. 4 (119th): note the procedural "Rule ... passed House" a day before real passage.
HR4 = [
    {"actionDate": "2025-07-24", "type": "BecameLaw", "actionCode": "36000", "text": "Became Public Law No: 119-28."},
    {"actionDate": "2025-07-18", "type": "President", "actionCode": "28000", "text": "Presented to President."},
    {"actionDate": "2025-07-17", "type": "Floor", "actionCode": "17000",
     "text": "Passed/agreed to in Senate: Passed Senate with an amendment by Yea-Nay Vote. 51 - 48."},
    {"actionDate": "2025-07-17", "type": "Floor",
     "text": "Motion to recommit to Senate Committee on Appropriations rejected"},
    {"actionDate": "2025-07-10", "type": "IntroReferral",
     "text": "Received in the Senate and Read twice and referred jointly to the Committee on Appropriations"},
    {"actionDate": "2025-06-12", "type": "Floor", "actionCode": "8000",
     "text": "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 214 - 212."},
    {"actionDate": "2025-06-11", "type": "Floor", "actionCode": "H1L220", "text": "Rule H. Res. 499 passed House."},
    {"actionDate": "2025-06-06", "type": "IntroReferral", "actionCode": "H11100",
     "text": "Referred to the House Committee on Appropriations."},
    {"actionDate": "2025-06-06", "type": "IntroReferral", "actionCode": "1000", "text": "Introduced in House"},
]


def test_milestones_from_real_actions():
    reached = timeline.milestones(HR4, date(2025, 6, 6))
    assert reached == {
        "introduced": "2025-06-06", "in_committee": "2025-06-06", "passed_house": "2025-06-12",
        "passed_senate": "2025-07-17", "to_president": "2025-07-18", "became_law": "2025-07-24",
    }
    assert timeline.status("HR", reached) == "became_law"


def test_steps_follow_the_bill_type():
    assert [s["stage"] for s in timeline.steps("S", {})] == [
        "introduced", "in_committee", "passed_senate", "passed_house", "to_president", "became_law"]
    hres = timeline.steps("HRES", {"introduced": "2026-01-02", "passed_house": "2026-01-09"})
    assert [(s["label"], s["reached"]) for s in hres] == [
        ("Introduced", True), ("In committee", True), ("Agreed to in House", True)]
    assert hres[1]["date"] is None  # went straight to the floor
    vetoed = timeline.steps("HR", {"introduced": "2026-01-02", "vetoed": "2026-03-01"})
    assert vetoed[-1]["stage"] == "vetoed" and vetoed[-1]["reached"]


def test_status_never_goes_backwards():
    """The latest action after House passage is a Senate referral; status stays passed_house."""
    actions = [a for a in HR4 if a["actionDate"] <= "2025-07-10"]
    assert timeline.status("HR", timeline.milestones(actions)) == "passed_house"


async def test_bill_api_includes_timeline(client, db):
    bill = await make_bill(db)
    bill.milestones = {"introduced": "2026-01-05", "in_committee": "2026-01-06"}
    await db.commit()
    h = await signup(client)
    steps = (await client.get(f"/bills/{bill.id}", headers=h)).json()["timeline"]
    assert [(s["short"], s["date"], s["reached"]) for s in steps[:3]] == [
        ("Intro", "2026-01-05", True), ("Committee", "2026-01-06", True), ("House", None, False)]


async def test_search_by_status(client, db):
    law = await make_bill(db, title="Signed Act")
    law.status = "became_law"
    to_senate = await make_bill(db, title="House Passed Act")
    to_senate.status = "passed_house"
    adopted = await make_bill(db, title="House Resolution", bill_type="HRES")
    adopted.status = "passed_house"  # agreed to; never goes to the Senate
    to_house = await make_bill(db, title="Senate Passed Act", bill_type="S")
    to_house.status = "passed_senate"
    stuck = await make_bill(db, title="Committee Act")
    stuck.status = "in_committee"
    await db.commit()
    h = await signup(client)

    async def titles(stage, **params):
        r = await client.get("/search", params={"stage": stage, **params}, headers=h)
        return [b["title"] for b in r.json()["items"]]

    assert await titles("law") == ["Signed Act"]
    assert await titles("senate") == ["House Passed Act"]
    assert await titles("house") == ["Senate Passed Act"]
    assert await titles("committee") == ["Committee Act"]
    assert await titles("committee", party="R") == []
    assert (await client.get("/search", params={"stage": "nope"}, headers=h)).status_code == 422

    counts = {s["key"]: s["bill_count"] for s in (await client.get("/stages", headers=h)).json()}
    assert counts == {"law": 1, "president": 0, "senate": 1, "house": 1, "committee": 1, "vetoed": 0}
    # Counts follow the other filters: only the Senate bill is in that chamber.
    r = await client.get("/stages", params={"chamber": "senate"}, headers=h)
    assert {s["key"]: s["bill_count"] for s in r.json()}["house"] == 1
    assert sum(s["bill_count"] for s in r.json()) == 1
