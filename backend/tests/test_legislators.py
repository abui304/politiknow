"""Sponsors, cosponsors, and searching by legislator."""

from sqlalchemy import select

from app.models import Bill, BillCosponsor, Legislator
from app.services.ingest import run_ingestion
from tests.conftest import signup
from tests.factories import make_bill
from tests.test_ingest import FakeCongress

WARREN = {"bioguideId": "W000817", "fullName": "Sen. Warren, Elizabeth [D-MA]",
          "firstName": "Elizabeth", "lastName": "Warren", "party": "D", "state": "MA"}
CRUZ = {"bioguideId": "C001098", "fullName": "Sen. Cruz, Ted [R-TX]",
        "firstName": "Ted", "lastName": "Cruz", "party": "R", "state": "TX"}
SANDERS = {"bioguideId": "S000033", "fullName": "Sen. Sanders, Bernard [I-VT]",
           "firstName": "Bernard", "lastName": "Sanders", "party": "I", "state": "VT"}
PELOSI = {"bioguideId": "P000197", "fullName": "Rep. Pelosi, Nancy [D-CA-11]",
          "firstName": "Nancy", "lastName": "Pelosi", "party": "D", "state": "CA", "district": 11}


class CosponsorCongress(FakeCongress):
    def __init__(self):
        super().__init__()
        self.text = {1: "Text.", 2: None}
        self.cosponsor_list = [
            {**CRUZ, "isOriginalCosponsor": False, "sponsorshipDate": "2026-09-05"},
            {**PELOSI, "isOriginalCosponsor": True, "sponsorshipDate": "2026-09-01"},
            {**SANDERS, "isOriginalCosponsor": True, "sponsorshipDate": "2026-09-01",
             "sponsorshipWithdrawnDate": "2026-09-03"},
        ]
        self.cosponsor_calls = 0

    async def bill_detail(self, congress, bill_type, number):
        return {**await super().bill_detail(congress, bill_type, number),
                "sponsors": [WARREN], "cosponsors": {"count": 2, "countIncludingWithdrawnCosponsors": 3}}

    async def cosponsors(self, congress, bill_type, number):
        self.cosponsor_calls += 1
        return self.cosponsor_list


async def test_ingestion_stores_sponsor_and_current_cosponsors(db):
    api = CosponsorCongress()
    await run_ingestion(db, api)
    bill = await db.scalar(select(Bill).where(Bill.bill_number == 1))
    assert (bill.sponsor_id, bill.cosponsor_count) == ("W000817", 2)
    links = {c.bioguide_id: c for c in await db.scalars(select(BillCosponsor).where(BillCosponsor.bill_id == bill.id))}
    assert set(links) == {"C001098", "P000197"}  # Sanders withdrew
    assert links["P000197"].is_original
    pelosi = await db.get(Legislator, "P000197")
    assert (pelosi.name, pelosi.chamber, pelosi.district) == ("Nancy Pelosi", "house", 11)
    assert (await db.get(Legislator, "W000817")).chamber == "senate"

    # Unchanged count: no refetch. Both bills report 2 cosponsors, so the first run made 2 calls.
    calls = api.cosponsor_calls
    await run_ingestion(db, api)
    assert api.cosponsor_calls == calls


async def _seed(db):
    for m in (WARREN, CRUZ, SANDERS, PELOSI):
        db.add(Legislator(bioguide_id=m["bioguideId"], full_name=m["fullName"], first_name=m["firstName"],
                          last_name=m["lastName"], party=m["party"], state=m["state"], district=m.get("district"),
                          chamber="house" if "district" in m else "senate"))
    await db.commit()
    insulin = await make_bill(db, title="Insulin Price Cap Act", sponsor_id="W000817", party="D", bill_type="S")
    border = await make_bill(db, title="Border Act", sponsor_id="C001098", party="R", bill_type="S", days_ago=2)
    parks = await make_bill(db, title="Parks Act", sponsor_id="S000033", party="I", bill_type="S", days_ago=3)
    housing = await make_bill(db, title="Housing Act", sponsor_id="P000197", party="D", days_ago=4)
    db.add_all([
        BillCosponsor(bill_id=insulin.id, bioguide_id="C001098", is_original=False),
        BillCosponsor(bill_id=insulin.id, bioguide_id="P000197", is_original=True),
        BillCosponsor(bill_id=housing.id, bioguide_id="W000817", is_original=True),
    ])
    await db.commit()
    return insulin, border, parks, housing


async def test_legislator_pages(client, db):
    insulin, border, parks, housing = await _seed(db)
    h = await signup(client)

    r = await client.get("/legislators/W000817", headers=h)
    assert r.json()["name"] == "Elizabeth Warren"
    assert (r.json()["sponsored_count"], r.json()["cosponsored_count"]) == (1, 1)
    assert (await client.get("/legislators/NOPE", headers=h)).status_code == 404

    def titles(resp):
        return [b["title"] for b in resp.json()["items"]]

    base = "/legislators/W000817/bills"
    assert titles(await client.get(base, headers=h)) == ["Insulin Price Cap Act", "Housing Act"]
    assert titles(await client.get(base, params={"role": "sponsored"}, headers=h)) == ["Insulin Price Cap Act"]
    assert titles(await client.get(base, params={"role": "cosponsored"}, headers=h)) == ["Housing Act"]

    r = await client.get(f"/bills/{insulin.id}/cosponsors", headers=h)
    assert [(c["name"], c["is_original"]) for c in r.json()] == [("Nancy Pelosi", True), ("Ted Cruz", False)]
    assert (await client.get(f"/bills/{insulin.id}", headers=h)).json()["sponsor_id"] == "W000817"


async def test_list_legislators(client, db):
    await _seed(db)
    h = await signup(client)

    def ids(resp):
        return [m["bioguide_id"] for m in resp.json()]

    r = await client.get("/legislators", headers=h)
    # Most bills first (Cruz, Pelosi, Warren have 2 each, tied by last name), Sanders 1.
    assert ids(r) == ["C001098", "P000197", "W000817", "S000033"]
    assert ids(await client.get("/legislators", params={"q": "elizabeth warren"}, headers=h)) == ["W000817"]
    assert ids(await client.get("/legislators", params={"q": "warren, eliz"}, headers=h)) == ["W000817"]
    assert ids(await client.get("/legislators", params={"party": "I"}, headers=h)) == ["S000033"]
    assert ids(await client.get("/legislators", params={"chamber": "house"}, headers=h)) == ["P000197"]


async def test_search_by_sponsor(client, db):
    await _seed(db)
    h = await signup(client)

    async def titles(**params):
        r = await client.get("/search", params=params, headers=h)
        assert r.status_code == 200, r.text
        return [b["title"] for b in r.json()["items"]]

    assert await titles(party="R") == ["Border Act"]
    assert await titles(party="I") == ["Parks Act"]
    assert await titles(chamber="house") == ["Housing Act"]
    assert await titles(party="D", chamber="senate") == ["Insulin Price Cap Act"]
    # Cruz sponsored Border Act and cosponsored Insulin.
    assert set(await titles(q="cruz")) == {"Border Act", "Insulin Price Cap Act"}
    # A title match ranks above name matches, even when it's older.
    await make_bill(db, title="Pelosi Tribute Act", days_ago=30)
    assert await titles(q="pelosi") == ["Pelosi Tribute Act", "Insulin Price Cap Act", "Housing Act"]
