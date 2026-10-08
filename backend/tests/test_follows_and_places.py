"""Following bills, legislators, and districts; finding your representatives; feed reasons and sorting;
full-text search; the floor calendar."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.models import Comment, Legislator, Notification, User
from app.services import floor, legislators
from app.services.ingest import run_ingestion
from tests.conftest import signup
from tests.factories import make_bill
from tests.test_ingest import FakeCongress

SCHRIER = dict(bioguide_id="S001216", full_name="Rep. Schrier, Kim [D-WA-8]", first_name="Kim", last_name="Schrier",
               party="D", state="WA", district=8, chamber="house", in_office=True)
MURRAY = dict(bioguide_id="M001111", full_name="Sen. Murray, Patty [D-WA]", first_name="Patty", last_name="Murray",
              party="D", state="WA", chamber="senate", in_office=True)
CANTWELL = dict(bioguide_id="C000127", full_name="Sen. Cantwell, Maria [D-WA]", first_name="Maria",
                last_name="Cantwell", party="D", state="WA", chamber="senate", in_office=True)
FORMER = dict(bioguide_id="R000001", full_name="Rep. Gone, Old [R-WA-8]", first_name="Old", last_name="Gone",
              party="R", state="WA", district=8, chamber="house", in_office=False)
ISSAQUAH = {"latitude": 47.5301, "longitude": -122.0326}  # WA-8


async def _seed_wa(db):
    db.add_all([Legislator(**m) for m in (SCHRIER, MURRAY, CANTWELL, FORMER)])
    await db.commit()


async def test_follow_bill_gets_status_alerts(client, db):
    bill = await make_bill(db)
    h = await signup(client, "watcher")
    assert (await client.get(f"/bills/{bill.id}", headers=h)).json()["is_following"] is False
    assert (await client.post(f"/bills/{bill.id}/follow", headers=h)).status_code == 204
    assert (await client.post(f"/bills/{bill.id}/follow", headers=h)).status_code == 204  # idempotent
    assert (await client.get(f"/bills/{bill.id}", headers=h)).json()["is_following"] is True
    following = (await client.get("/users/me/following", headers=h)).json()
    assert [b["id"] for b in following["bills"]] == [str(bill.id)]

    from app.services import notify
    await notify.notify_status_change(db, bill)
    await db.commit()
    alerts = list(await db.scalars(select(Notification).where(Notification.type == "status_update")))
    assert len(alerts) == 1

    await client.delete(f"/bills/{bill.id}/follow", headers=h)
    assert (await client.get("/users/me/following", headers=h)).json()["bills"] == []


async def test_follow_legislator_alerts_and_feed(client, db):
    h = await signup(client, "fan", tags=("Energy", "Taxation", "Education", "Immigration", "Agriculture and Food"))
    api = FakeCongress()  # bill 1 is sponsored by X1
    db.add(Legislator(bioguide_id="X1", full_name="Rep. Someone [D-CA-1]", first_name="Some", last_name="One"))
    await db.commit()
    assert (await client.post("/legislators/X1/follow", headers=h)).status_code == 204
    assert (await client.get("/legislators/X1", headers=h)).json()["is_following"] is True
    assert (await client.post("/legislators/NOPE/follow", headers=h)).status_code == 404

    await run_ingestion(db, api)
    alert = await db.scalar(select(Notification).where(Notification.type == "legislator"))
    assert alert.title == "Rep. Someone [D-CA-1] sponsored a bill"  # the fake member has no first/last name

    feed = (await client.get("/feed", headers=h)).json()["items"]
    assert feed[0]["bill_number"] == 1
    assert feed[0]["reason"] == "Sponsored by Rep. Someone [D-CA-1], who you follow"


async def test_new_cosponsor_alerts_followers(client, db):
    from app.services import notify

    bill = await make_bill(db)
    db.add(Legislator(**SCHRIER))
    await db.commit()
    h = await signup(client, "fan2")
    await client.post(f"/legislators/{SCHRIER['bioguide_id']}/follow", headers=h)
    await notify.notify_legislator_bill(db, bill, None, {SCHRIER["bioguide_id"]})
    await db.commit()
    alert = await db.scalar(select(Notification).where(Notification.type == "legislator"))
    assert alert.title == "Kim Schrier cosponsored a bill"


async def test_feed_reasons_and_most_discussed(client, db):
    health = await make_bill(db, tags=("Health",), days_ago=1)  # recency outweighs one of 5 topics...
    quiet = await make_bill(db, tags=("Defense",), days_ago=1)
    h = await signup(client, "reader")
    items = {b["id"]: b for b in (await client.get("/feed", headers=h)).json()["items"]}
    assert items[str(health.id)]["reason"] == "Because you follow Health"  # ...but the topic is the reason
    assert items[str(quiet.id)]["reason"] == "Recent activity in Congress"

    user = await db.scalar(select(User).where(User.display_name == "reader"))
    db.add_all([Comment(user_id=user.id, bill_id=quiet.id, body=f"c{i}") for i in range(2)])
    quiet.comment_count = 2
    await db.commit()
    r = (await client.get("/feed?sort=discussed", headers=h)).json()
    assert [b["id"] for b in r["items"]] == [str(quiet.id)]
    assert r["items"][0]["reason"] == "2 comments this week"


async def test_comment_sorting(client, db):
    bill = await make_bill(db)
    h = await signup(client, "talker")
    user = await db.scalar(select(User).where(User.display_name == "talker"))
    now = datetime.now(UTC)
    db.add_all([
        Comment(user_id=user.id, bill_id=bill.id, body="old but liked", net_score=5,
                created_at=now - timedelta(days=1)),
        Comment(user_id=user.id, bill_id=bill.id, body="new", net_score=0, created_at=now),
    ])
    await db.commit()
    top = (await client.get(f"/bills/{bill.id}/comments", headers=h)).json()
    new = (await client.get(f"/bills/{bill.id}/comments?sort=new", headers=h)).json()
    assert [c["body"] for c in top] == ["old but liked", "new"]
    assert [c["body"] for c in new] == ["new", "old but liked"]


async def test_full_text_search_with_snippets(client, db):
    bill = await make_bill(db, title="A Bill to Improve Things")
    bill.full_text = "Section 4. The Secretary shall reduce taxes on family farms by ten percent."
    bill.summary_detailed = "Changes agricultural policy."
    other = await make_bill(db, title="Unrelated Act")
    await db.commit()
    h = await signup(client, "searcher")

    r = (await client.get("/search", params={"q": "farm tax"}, headers=h)).json()["items"]  # stemmed, any order
    assert [b["id"] for b in r] == [str(bill.id)]
    assert "\x02farms\x03" in r[0]["snippet"] and "\x02taxes\x03" in r[0]["snippet"]
    r = (await client.get("/search", params={"q": "unrelated"}, headers=h)).json()["items"]
    assert [b["id"] for b in r] == [str(other.id)] and r[0]["snippet"] is None  # title match, no snippet
    r = (await client.get("/search", params={"q": "farms -taxes"}, headers=h)).json()["items"]
    assert r == []


async def test_find_my_representatives(client, db):
    await _seed_wa(db)
    h = await signup(client, "voter")
    assert (await client.get("/users/me/representatives", headers=h)).json() == {"home": None, "senators": []}

    r = await client.post("/users/me/home/locate", json=ISSAQUAH, headers=h)
    assert r.status_code == 200, r.text
    reps = r.json()
    assert reps["home"]["label"] == "WA-8" and reps["home"]["name"] == "Washington's 8th District"
    assert reps["home"]["representative"]["name"] == "Kim Schrier"  # not the former member
    assert [s["name"] for s in reps["senators"]] == ["Maria Cantwell", "Patty Murray"]

    me = (await client.get("/users/me", headers=h)).json()
    assert (me["home_state"], me["home_district"]) == ("WA", 8)
    # Only the district is stored, and it's not on the public profile.
    user = await db.scalar(select(User).where(User.display_name == "voter"))
    assert "home_state" not in (await client.get(f"/users/{user.id}", headers=h)).json()

    r = await client.post("/users/me/home/locate", json={"latitude": 30, "longitude": -40}, headers=h)
    assert r.status_code == 404  # the Atlantic
    assert (await client.put("/users/me/home", json={"state": "WA", "district": 11}, headers=h)).status_code == 404
    r = await client.put("/users/me/home", json={"state": "wy", "district": 0}, headers=h)
    assert r.json()["home"]["label"] == "WY-AL" and r.json()["home"]["name"] == "Wyoming at-large"
    assert (await client.delete("/users/me/home", headers=h)).status_code == 204
    assert (await client.get("/users/me", headers=h)).json()["home_state"] is None


async def test_follow_districts_and_state_list(client, db):
    await _seed_wa(db)
    h = await signup(client, "mapper")
    await client.put("/users/me/home", json={"state": "WA", "district": 7}, headers=h)
    assert (await client.post("/districts/wa/8/follow", headers=h)).status_code == 204
    assert (await client.post("/districts/WA/99/follow", headers=h)).status_code == 404
    await client.post("/districts/PR/0/follow", headers=h)

    mine = (await client.get("/users/me/districts", headers=h)).json()
    assert [d["label"] for d in mine] == ["WA-8", "PR-AL"]
    assert mine[1]["name"] == "Puerto Rico (delegate)"

    wa = (await client.get("/districts/WA", headers=h)).json()
    assert wa["name"] == "Washington" and len(wa["districts"]) == 10 and len(wa["senators"]) == 2
    by_n = {d["district"]: d for d in wa["districts"]}
    assert by_n[8]["is_following"] and by_n[8]["representative"]["name"] == "Kim Schrier"
    assert by_n[7]["is_home"] and by_n[7]["representative"] is None  # not in the roster here
    assert (await client.get("/districts/ZZ", headers=h)).status_code == 404

    await client.delete("/districts/WA/8/follow", headers=h)
    assert [d["label"] for d in (await client.get("/users/me/districts", headers=h)).json()] == ["PR-AL"]


async def test_sync_roster(db):
    db.add(Legislator(**{**FORMER, "in_office": True}))
    db.add(Legislator(bioguide_id="S001216", full_name="Rep. Schrier, Kim [D-WA-8]", first_name="Kim",
                      last_name="Schrier", image_url="https://synced.jpg"))
    await db.commit()

    class Roster(FakeCongress):
        async def current_members(self, congress):
            return [
                {"bioguideId": "S001216", "name": "Schrier, Kim", "partyName": "Democratic", "state": "Washington",
                 "district": 8, "terms": {"item": [{"chamber": "House of Representatives", "startYear": 2019}]},
                 "depiction": {"imageUrl": "https://list.jpg"}},
                {"bioguideId": "M001111", "name": "Murray, Patty", "partyName": "Democratic", "state": "Washington",
                 "terms": {"item": [{"chamber": "Senate", "startYear": 1993}]}},
                {"bioguideId": "K000404", "name": "King-Hinds, Kimberlyn", "partyName": "Republican",
                 "state": "Northern Mariana Islands", "district": 0,
                 "terms": {"item": [{"chamber": "House of Representatives", "startYear": 2025}]}},
            ]

    assert await legislators.sync_roster(db, Roster()) == 3
    db.expire_all()
    former = await db.get(Legislator, FORMER["bioguide_id"])
    schrier = await db.get(Legislator, "S001216")
    murray = await db.get(Legislator, "M001111")
    king = await db.get(Legislator, "K000404")
    assert not former.in_office
    assert schrier.in_office and (schrier.state, schrier.district) == ("WA", 8)
    assert schrier.image_url == "https://synced.jpg"  # an already-synced photo is kept
    assert (murray.chamber, murray.district, murray.full_name) == ("senate", None, "Sen. Murray, Patty [D-WA]")
    assert (king.state, king.district, king.name) == ("MP", 0, "Kimberlyn King-Hinds")


HOUSE_XML = """<floorschedule congress-num="119" week-date="2026-10-05">
  <category type="Items that may be considered under suspension of the rules" sort-order="1"><floor-items>
    <floor-item id="1" remove-date=""><legis-num>H.R. 2066</legis-num>
      <floor-text>Investing Act, as amended</floor-text></floor-item>
    <floor-item id="2" remove-date="2026-10-06"><legis-num>H.R. 9</legis-num>
      <floor-text>Pulled</floor-text></floor-item>
  </floor-items></category>
  <category type="Items that may be considered pursuant to a rule" sort-order="2"><floor-items>
    <floor-item id="3" remove-date=""><legis-num>H. Res. 916</legis-num>
      <floor-text>Providing for consideration of the bill (H.R. 4312) to protect athletes</floor-text></floor-item>
  </floor-items></category>
</floorschedule>"""

SENATE_HTML = """<article id="proceedings_schedule" class="fluid"><h3>Monday, Oct 05, 2026</h3>
<span class="floor-schedule">Convene at 3:00 p.m. and resume consideration of S. 12,
the U.S. Parks Act.</span></article>
<article id="proceedings_schedule_2" class="fluid"><h3>Previous Meeting</h3>
<span class="floor-schedule"><strong>Friday, Oct 02, 2026</strong><br>The Senate convened at
10:00 a.m.</span></article>"""


def test_floor_parsing():
    house = floor.parse_house(HOUSE_XML)
    assert [(i["heading"], i["bills"]) for i in house] == [
        ("Under suspension of the rules", ["H.R. 2066"]),
        ("Under a rule", ["H.Res. 916", "H.R. 4312"]),
    ]
    senate = floor.parse_senate(SENATE_HTML)
    assert senate == [
        {"day": "2026-10-02", "heading": "Last met: Friday, Oct 02, 2026",
         "text": "The Senate convened at 10:00 a.m.", "bills": []},
        {"day": "2026-10-05", "heading": "Next meeting: Monday, Oct 05, 2026",
         "text": "Convene at 3:00 p.m. and resume consideration of S. 12, the U.S. Parks Act.", "bills": ["S. 12"]},
    ]
    assert floor.week_of(date(2026, 10, 8)) == date(2026, 10, 5)


async def test_calendar_links_known_bills(client, db, monkeypatch):
    bill = await make_bill(db)  # H.R. <n>
    label = bill.label

    async def fake_week(redis, today=None):
        return {"week_of": "2026-10-05", "house_week_of": "2026-10-05", "senate": [],
                "house": [{"day": None, "heading": "Under a rule", "text": "x", "bills": [label, "S. 99999"]}],
                "house_url": "https://docs.house.gov/floor", "senate_url": "https://www.senate.gov"}

    monkeypatch.setattr(floor, "this_week", fake_week)
    h = await signup(client, "scheduler")
    r = (await client.get("/calendar", headers=h)).json()
    assert r["week_of"] == "2026-10-05"
    assert r["house"][0]["bills"] == [{"label": label, "bill_id": str(bill.id)}, {"label": "S. 99999", "bill_id": None}]
