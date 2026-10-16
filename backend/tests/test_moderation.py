from sqlalchemy import select, update

from app.models import Bill, User
from app.services import llm
from tests.conftest import signup
from tests.factories import make_bill


async def make_moderator(client, db, name="mod"):
    headers = await signup(client, name)
    await db.execute(update(User).where(User.display_name == name).values(is_moderator=True))
    await db.commit()
    return headers


async def comment(client, bill, headers, body="hello"):
    r = await client.post(f"/bills/{bill.id}/comments", json={"body": body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def report(client, comment_id, headers, category="spam"):
    r = await client.post(f"/comments/{comment_id}/report", json={"category": category}, headers=headers)
    assert r.status_code == 204, r.text


async def test_dashboard_is_moderators_only(client, db):
    user = await signup(client, "regular")
    mod = await make_moderator(client, db)
    assert (await client.get("/users/me", headers=user)).json()["is_moderator"] is False
    assert (await client.get("/users/me", headers=mod)).json()["is_moderator"] is True
    for path in ("/moderation/comments", "/moderation/users", "/moderation/summary-reports"):
        assert (await client.get(path, headers=user)).status_code == 403
        assert (await client.get(path, headers=mod)).status_code == 200


async def test_reported_comment_queue_and_approve(client, db):
    bill = await make_bill(db)
    mod = await make_moderator(client, db)
    author = await signup(client, "author")
    reporters = [await signup(client, f"rep{i}") for i in range(4)]
    c = await comment(client, bill, author)
    await comment(client, bill, author, "unreported")
    for h in reporters[:3]:
        await report(client, c["id"], h, "harassment")

    queue = (await client.get("/moderation/comments", headers=mod)).json()
    assert [q["id"] for q in queue] == [c["id"]]
    assert queue[0]["is_hidden"] is True and queue[0]["report_count"] == 3
    assert queue[0]["report_categories"] == {"harassment": 3}
    assert queue[0]["bill_label"] == bill.label and queue[0]["author_name"] == "author"

    # Approving restores the comment and empties the queue.
    assert (await client.post(f"/moderation/comments/{c['id']}/approve", headers=mod)).status_code == 204
    assert (await client.get("/moderation/comments", headers=mod)).json() == []
    assert len((await client.get(f"/bills/{bill.id}/comments", headers=reporters[0])).json()) == 2
    assert (await client.get(f"/bills/{bill.id}", headers=mod)).json()["comment_count"] == 2

    # A new report puts it back in the queue, but it takes 3 new ones to auto-hide it again.
    await report(client, c["id"], reporters[3])
    queue = (await client.get("/moderation/comments", headers=mod)).json()
    assert queue[0]["report_count"] == 1 and queue[0]["is_hidden"] is False


async def test_moderator_hide_and_hidden_view(client, db):
    bill = await make_bill(db)
    mod = await make_moderator(client, db)
    author = await signup(client, "author")
    viewer = await signup(client, "viewer")
    c = await comment(client, bill, author)
    await report(client, c["id"], viewer)

    assert (await client.post(f"/moderation/comments/{c['id']}/hide", headers=mod)).status_code == 204
    assert (await client.get("/moderation/comments", headers=mod)).json() == []
    hidden = (await client.get("/moderation/comments?view=hidden", headers=mod)).json()
    assert [h["id"] for h in hidden] == [c["id"]]
    assert (await client.get(f"/bills/{bill.id}/comments", headers=viewer)).json() == []
    assert (await client.get(f"/bills/{bill.id}", headers=viewer)).json()["comment_count"] == 0


async def test_ai_flagged_comment_is_queued(client, db, monkeypatch):
    async def fake_moderate(text):
        return llm.ModerationResult(flagged=True, max_score=0.5)

    from app.services import moderation

    monkeypatch.setattr(llm, "moderate", fake_moderate)
    bill = await make_bill(db)
    mod = await make_moderator(client, db)
    c = await comment(client, bill, await signup(client, "author"))
    await moderation.moderate_comment(db, c["id"])
    queue = (await client.get("/moderation/comments", headers=mod)).json()
    assert queue[0]["is_flagged"] is True and queue[0]["is_hidden"] is False


async def test_shadow_ban_management(client, db):
    bill = await make_bill(db)
    mod = await make_moderator(client, db)
    author = await signup(client, "author")
    viewer = await signup(client, "viewer")
    await comment(client, bill, author)
    author_id = (await client.get("/users/me", headers=author)).json()["id"]

    assert (await client.get("/moderation/users", headers=mod)).json() == []
    assert (await client.put(f"/moderation/users/{author_id}/shadow-ban", headers=mod)).status_code == 204
    banned = (await client.get("/moderation/users", headers=mod)).json()
    assert [u["display_name"] for u in banned] == ["author"] and banned[0]["comment_count"] == 1
    assert (await client.get(f"/bills/{bill.id}/comments", headers=viewer)).json() == []
    assert (await client.get(f"/bills/{bill.id}", headers=viewer)).json()["comment_count"] == 0

    found = (await client.get("/moderation/users?q=AUT", headers=mod)).json()
    assert [u["display_name"] for u in found] == ["author"]

    assert (await client.delete(f"/moderation/users/{author_id}/shadow-ban", headers=mod)).status_code == 204
    assert (await client.get("/moderation/users", headers=mod)).json() == []
    assert (await client.get(f"/bills/{bill.id}", headers=viewer)).json()["comment_count"] == 1

    mod_id = (await client.get("/users/me", headers=mod)).json()["id"]
    assert (await client.put(f"/moderation/users/{mod_id}/shadow-ban", headers=mod)).status_code == 400


async def test_summary_reports_resolve_and_regenerate(client, db, monkeypatch):
    bill = await make_bill(db)
    other = await make_bill(db)
    mod = await make_moderator(client, db)
    user = await signup(client, "reader")
    for b, feedback in ((bill, "Misses section 2"), (bill, None), (other, "Biased")):
        r = await client.post(f"/bills/{b.id}/report-summary", json={"feedback": feedback}, headers=user)
        assert r.status_code == 204

    groups = (await client.get("/moderation/summary-reports", headers=mod)).json()
    assert {g["bill_id"]: len(g["reports"]) for g in groups} == {str(bill.id): 2, str(other.id): 1}

    # No OpenAI key in tests: regenerating is refused rather than replacing the summary with an excerpt.
    r = await client.post(f"/moderation/bills/{bill.id}/regenerate-summary", headers=mod)
    assert r.status_code == 409

    async def fake_summarize(title, text):
        return "new simple", "new detailed"

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "summarize", fake_summarize)
    r = await client.post(f"/moderation/bills/{bill.id}/regenerate-summary", headers=mod)
    assert r.status_code == 200 and r.json()["summary_simple"] == "new simple"
    bill_id, other_id = bill.id, other.id
    db.expire_all()
    assert (await db.scalar(select(Bill.summary_detailed).where(Bill.id == bill_id))) == "new detailed"

    assert (await client.post(f"/moderation/bills/{other_id}/summary-reports/resolve", headers=mod)).status_code == 204
    assert (await client.get("/moderation/summary-reports", headers=mod)).json() == []
