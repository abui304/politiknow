from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import Legislator, MemberVote, Notification, RollCall, User
from app.services import votes
from tests.conftest import signup
from tests.factories import make_bill

NOW = datetime.now(UTC)

HOUSE_MEMBERS = [
    {"bioguideID": "H1", "voteCast": "Aye", "voteParty": "D", "voteState": "WA"},
    {"bioguideID": "H2", "voteCast": "No", "voteParty": "R", "voteState": "TX"},
    {"bioguideID": "H3", "voteCast": "Not Voting", "voteParty": "R", "voteState": "TX"},
]

SENATE_MENU = """<vote_summary><votes>
<vote><vote_number>00002</vote_number></vote><vote><vote_number>00001</vote_number></vote>
</votes></vote_summary>"""


def senate_vote(n: int, bill_number: int, question: str) -> str:
    when = (NOW - timedelta(days=1)).strftime("%B %-d, %Y, %I:%M %p")
    return f"""<roll_call_vote><congress>119</congress><session>2</session><vote_number>{n}</vote_number>
<vote_date>{when}</vote_date><vote_question_text>{question}</vote_question_text>
<vote_result_text>Bill Passed (52-47)</vote_result_text>
<document><document_type>H.R.</document_type><document_number>{bill_number}</document_number>
<document_name>H.R. {bill_number}</document_name></document>
<members>
<member><last_name>Murray</last_name><first_name>Patty</first_name><party>D</party><state>WA</state>
<vote_cast>Yea</vote_cast><lis_member_id>S229</lis_member_id></member>
<member><last_name>Cantwell</last_name><first_name>Maria</first_name><party>D</party><state>WA</state>
<vote_cast>Nay</vote_cast><lis_member_id>S275</lis_member_id></member>
<member><last_name>Nobody</last_name><party>R</party><state>ZZ</state><vote_cast>Yea</vote_cast></member>
</members></roll_call_vote>"""


class FakeVotes:
    def __init__(self, bill_number: int):
        self.bill_number = bill_number
        self.house_detail_calls = 0

    async def house_votes(self, congress, session):
        return [{"rollCallNumber": 10}, {"rollCallNumber": 11}]

    async def house_vote(self, congress, session, number):
        self.house_detail_calls += 1
        question = "On Passage" if number == 11 else "On Motion to Recommit"
        return {
            "startDate": (NOW - timedelta(hours=3)).isoformat(), "result": "Passed", "voteQuestion": question,
            "legislationType": "HR", "legislationNumber": str(self.bill_number),
            "sourceDataURL": f"https://clerk.house.gov/evs/2026/roll0{number}.xml",
        }

    async def house_vote_members(self, congress, session, number):
        return HOUSE_MEMBERS

    async def senate_xml(self, url):
        if "vote_menu" in url:
            return SENATE_MENU
        n = int(url.rsplit("_", 1)[1].split(".")[0])
        return senate_vote(n, self.bill_number, "On Passage of the Bill" if n == 2 else "On the Cloture Motion")


async def _members(db):
    db.add_all([
        Legislator(bioguide_id="H1", full_name="Rep. A", first_name="Ann", last_name="Able", party="D", state="WA",
                   district=8, chamber="house", in_office=True),
        Legislator(bioguide_id="H2", full_name="Rep. B", first_name="Bo", last_name="Baker", party="R", state="TX",
                   district=21, chamber="house", in_office=True),
        Legislator(bioguide_id="H3", full_name="Rep. C", first_name="Cy", last_name="Cole", party="R", state="TX",
                   district=2, chamber="house", in_office=True),
        Legislator(bioguide_id="M001111", full_name="Sen. Murray", first_name="Patty", last_name="Murray",
                   party="D", state="WA", chamber="senate", in_office=True),
        Legislator(bioguide_id="C000127", full_name="Sen. Cantwell", first_name="Maria", last_name="Cantwell",
                   party="D", state="WA", chamber="senate", in_office=True),
    ])
    await db.commit()


def test_classify_uses_the_official_question():
    assert votes.classify("On Passage") == "passage"
    assert votes.classify("On Motion to Suspend the Rules and Pass, as Amended") == "passage"
    assert votes.classify("On the Cloture Motion") == "cloture"
    assert votes.classify("On Motion to Recommit") == "procedural"
    assert votes.classify("On Ordering the Previous Question") == "procedural"
    assert votes.classify("On Agreeing to the Amendment") == "amendment"
    assert votes.classify("On the Nomination") == "nomination"
    assert votes.classify("On Motion to Concur in the Senate Amendment") == "passage"


async def test_sync_stores_both_chambers_and_matches_senators(db):
    await _members(db)
    bill = await make_bill(db)
    api = FakeVotes(bill.bill_number)
    result = await votes.sync_votes(db, api, congress=119, session=2)
    assert result == {"house": 2, "senate": 2}

    house = await db.scalar(select(RollCall).where(RollCall.chamber == "house", RollCall.number == 11))
    assert house.question == "On Passage" and house.kind == "passage" and house.bill_id == bill.id
    assert (house.yea, house.nay, house.not_voting) == (1, 1, 1)
    assert house.party_totals["R"] == {"yea": 0, "nay": 1, "present": 0, "not_voting": 1}

    senate = await db.scalar(select(RollCall).where(RollCall.chamber == "senate", RollCall.number == 2))
    positions = dict((await db.execute(
        select(MemberVote.bioguide_id, MemberVote.position).where(MemberVote.roll_call_id == senate.id))).all())
    assert positions == {"M001111": "Yea", "C000127": "Nay"}  # the unmatched senator is skipped
    assert senate.bill_id == bill.id and "senate.gov" in senate.source_url

    # A second run fetches nothing it already has.
    await votes.sync_votes(db, api, congress=119, session=2)
    assert api.house_detail_calls == 2


async def test_followers_get_how_their_members_voted(client, db):
    await _members(db)
    bill = await make_bill(db)
    h = await signup(client, "voter")
    user = await db.scalar(select(User).where(User.display_name == "voter"))
    user.home_state, user.home_district = "WA", 8
    await db.commit()
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    bystander = await signup(client, "bystander")  # follows nothing

    await votes.sync_votes(db, FakeVotes(bill.bill_number), congress=119, session=2)
    alerts = list(await db.scalars(select(Notification).where(Notification.type == "member_vote")))
    # Passage in both chambers and the Senate cloture vote, but not the House motion to recommit.
    assert len(alerts) == 3 and all(a.user_id == user.id for a in alerts)
    house_alert = next(a for a in alerts if a.body.startswith("House"))
    assert house_alert.title == f"How your members voted on {bill.label}"
    assert house_alert.body == "House, On Passage: Able (D) Yea. Result: Passed, 1–1."
    senate_alert = next(a for a in alerts if "Passage of the Bill" in a.body)
    assert "Cantwell (D) Nay · Murray (D) Yea" in senate_alert.body
    assert (await client.get("/notifications", headers=bystander)).json() == []


async def test_old_votes_dont_alert(db, client):
    await _members(db)
    bill = await make_bill(db)
    h = await signup(client, "voter")
    await client.post("/legislators/H1/follow", headers=h)
    await client.post(f"/bills/{bill.id}/follow", headers=h)
    api = FakeVotes(bill.bill_number)
    old = (NOW - timedelta(days=30)).isoformat()

    async def old_detail(c, s, n):
        return {"startDate": old, "result": "Passed", "voteQuestion": "On Passage",
                "legislationType": "HR", "legislationNumber": str(bill.bill_number)}

    api.house_vote = old_detail

    async def no_senate(url):
        raise RuntimeError("senate.gov unreachable")

    api.senate_xml = no_senate  # one chamber failing doesn't stop the other
    result = await votes.sync_votes(db, api, congress=119, session=2)
    assert result == {"house": 2, "senate": 0}
    assert not list(await db.scalars(select(Notification).where(Notification.type == "member_vote")))


async def test_bill_votes_endpoint_lists_passage_first_with_your_members(client, db):
    await _members(db)
    bill = await make_bill(db)
    h = await signup(client, "voter")
    user = await db.scalar(select(User).where(User.display_name == "voter"))
    user.home_state, user.home_district = "WA", 8
    await db.commit()
    await votes.sync_votes(db, FakeVotes(bill.bill_number), congress=119, session=2)

    out = (await client.get(f"/bills/{bill.id}/votes", headers=h)).json()
    assert [v["kind"] for v in out] == ["passage", "passage", "cloture", "procedural"]
    house = next(v for v in out if v["chamber"] == "house" and v["kind"] == "passage")
    assert [(m["name"], m["position"], m["note"]) for m in house["your_members"]] == [
        ("Ann Able", "Yea", "Your representative")]
    senate = next(v for v in out if v["chamber"] == "senate" and v["kind"] == "passage")
    assert [m["note"] for m in senate["your_members"]] == ["Your senator", "Your senator"]

    mine = (await client.get("/users/me/members/votes", headers=h)).json()["items"]
    assert {v["kind"] for v in mine} <= {"passage", "cloture"} and len(mine) == 3


async def test_member_votes_with_missed_count(client, db):
    await _members(db)
    bill = await make_bill(db)
    h = await signup(client, "voter")
    await votes.sync_votes(db, FakeVotes(bill.bill_number), congress=119, session=2)
    page = (await client.get("/legislators/H3/votes", headers=h)).json()
    assert (page["missed"], page["eligible"]) == (2, 2)
    assert page["items"][0]["position"] == "Not Voting"
    assert page["items"][0]["bill_label"] == bill.label
    only_passage = (await client.get("/legislators/H3/votes?kind=passage", headers=h)).json()["items"]
    assert len(only_passage) == 1
    assert (await client.get("/legislators/NOPE/votes", headers=h)).status_code == 404
