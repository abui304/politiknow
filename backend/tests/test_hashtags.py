from app.services import hashtags, llm
from tests.conftest import signup
from tests.factories import make_bill


def test_canonicalize_reuses_spelling_drops_generic_and_dedupes():
    vocab = {"texas": "Texas"}
    out = hashtags.canonicalize(["#texas", "Congress", "  Insulin   pricing ", "TEXAS", "insulin pricing"], vocab)
    assert out == ["Texas", "Insulin pricing"]
    assert vocab["insulin pricing"] == "Insulin pricing"  # new spellings become reusable


async def test_search_by_hashtag_is_case_insensitive(client, db):
    a = await make_bill(db, title="Ranch Water Act")
    a.sub_tags = ["Texas", "Water rights"]
    b = await make_bill(db, title="Gulf Ports Act")
    b.sub_tags = ["Texas"]
    c = await make_bill(db, title="Unrelated Act")
    c.sub_tags = ["Ohio"]
    await db.commit()
    h = await signup(client)

    r = await client.get("/search", params={"hashtag": "#TEXAS"}, headers=h)
    assert {x["title"] for x in r.json()["items"]} == {"Ranch Water Act", "Gulf Ports Act"}


async def test_text_search_matches_hashtags(client, db):
    bill = await make_bill(db, title="Some Unhelpful Title Act")
    bill.sub_tags = ["Insulin pricing"]
    await db.commit()
    h = await signup(client)
    r = await client.get("/search", params={"q": "insulin"}, headers=h)
    assert [x["title"] for x in r.json()["items"]] == ["Some Unhelpful Title Act"]
    r = await client.get("/search", params={"q": "#"}, headers=h)  # bare "#" isn't a search
    assert len(r.json()["items"]) == 1


async def test_popular_hashtags_only_lists_shared_ones(client, db):
    for tags in (["Texas", "Bridges"], ["texas"], ["Ohio"]):
        bill = await make_bill(db)
        bill.sub_tags = tags
    await db.commit()
    assert await hashtags.normalize_all(db) == 1  # "texas" -> "Texas"
    h = await signup(client)
    r = await client.get("/hashtags", headers=h)
    assert r.json() == [{"name": "Texas", "bill_count": 2}]


async def test_tagger_is_offered_existing_hashtags(monkeypatch):
    seen = {}

    async def fake_chat(system, user, json_mode=False):
        seen["system"] = system
        return '{"primary_tags": ["Health"], "sub_tags": ["insulin pricing", "Medicare"]}'

    monkeypatch.setattr(llm, "_chat", fake_chat)
    monkeypatch.setattr(llm, "_client", lambda: object())
    tags = await llm.generate_tags("T", "text", None, ["Insulin pricing", "Texas"])
    assert "Insulin pricing, Texas" in seen["system"]
    assert hashtags.canonicalize(tags.sub, {"insulin pricing": "Insulin pricing"}) == ["Insulin pricing", "Medicare"]
