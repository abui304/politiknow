from app.search_terms import bill_number, expand, loosen
from tests.conftest import signup
from tests.factories import make_bill


def test_bill_numbers_in_everyday_spellings():
    assert bill_number("H.R. 1037") == ("HR", 1037)
    assert bill_number("hr1037") == ("HR", 1037)
    assert bill_number("S. 2209") == ("S", 2209)
    assert bill_number("S.J.Res. 5") == ("SJRES", 5)
    assert bill_number("1037") == (None, 1037)
    assert bill_number("housing 2026") is None


def test_synonyms_and_loosening():
    assert '"greenhouse gas"' in expand("climate change")
    assert expand("housing") == "housing"
    assert loosen("student debt relief") == "student or debt or relief"


async def _search(client, h, **params):
    r = await client.get("/search", params=params, headers=h)
    assert r.status_code == 200, r.text
    return [b["title"] for b in r.json()["items"]]


async def test_search_finds_a_bill_by_its_number(client, db):
    bill = await make_bill(db, title="Housing Supply Act")
    await make_bill(db, title="Something else")
    h = await signup(client)
    assert (await _search(client, h, q=f"H.R. {bill.bill_number}"))[0] == "Housing Supply Act"
    assert (await _search(client, h, q=str(bill.bill_number)))[0] == "Housing Supply Act"
    assert await _search(client, h, q=f"S. {bill.bill_number}") == []


async def test_everyday_words_find_legal_ones(client, db):
    bill = await make_bill(db, title="Emissions Reporting Act")
    bill.summary_simple = bill.summary_detailed = "Requires power plants to report greenhouse gas emissions."
    await db.commit()
    h = await signup(client)
    assert await _search(client, h, q="climate change") == ["Emissions Reporting Act"]


async def test_no_strict_match_falls_back_to_any_word(client, db):
    await make_bill(db, title="Student Loan Interest Fairness Act")
    h = await signup(client)
    assert await _search(client, h, q="student loan forgiveness") == ["Student Loan Interest Fairness Act"]
    stages = (await client.get("/stages", params={"q": "student loan forgiveness"}, headers=h)).json()
    assert stages  # counts use the same fallback as the results


async def test_passed_a_chamber_is_cumulative(client, db):
    for status_ in ("in_committee", "passed_house", "to_president", "became_law"):
        bill = await make_bill(db, title=f"Bill {status_}")
        bill.status = status_
    await db.commit()
    h = await signup(client)
    passed = sorted(await _search(client, h, stage="passed"))
    assert passed == ["Bill became_law", "Bill passed_house", "Bill to_president"]


def test_everyday_words_find_their_topics():
    from app.taxonomy import POLICY_AREAS
    from app.topic_words import TOPIC_WORDS, topics_for

    assert set(TOPIC_WORDS) == set(POLICY_AREAS)
    assert topics_for("abortion")[0] == "Health"
    assert "Social Welfare" in topics_for("Social Security")
    assert topics_for("abort")  # partial words work
    assert topics_for("x") == []


async def test_tags_come_with_everyday_words(client):
    h = await signup(client)
    tags = {t["name"]: t["words"] for t in (await client.get("/tags", headers=h)).json()}
    assert "medicare" in tags["Health"]


async def test_related_bills_share_subjects_or_topic(client, db):
    base = await make_bill(db, tags=("Health",), title="Insulin Price Cap Act")
    base.sub_tags = ["insulin", "medicare"]
    twin = await make_bill(db, tags=("Taxation",), title="Diabetes Supply Tax Credit Act")
    twin.sub_tags = ["Insulin"]
    cousin = await make_bill(db, tags=("Health",), title="Rural Hospital Act")
    await make_bill(db, tags=("Energy",), title="Grid Act")
    await db.commit()
    h = await signup(client)
    titles = [b["title"] for b in (await client.get(f"/bills/{base.id}/related", headers=h)).json()]
    assert titles[0] == twin.title and cousin.title in titles and "Grid Act" not in titles
