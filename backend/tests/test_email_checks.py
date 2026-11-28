"""Sign-up email checks: throwaway and undeliverable addresses, and confirming before using the app."""

import pytest

from app.config import settings
from app.services import email, email_checks


@pytest.fixture
def confirmations(monkeypatch):
    """Turns confirmation on (as if Brevo were set up) and captures the emails instead of sending them."""
    sent: list[dict] = []

    async def fake_send(to, subj, html_body, text_body, unsubscribe=None):
        sent.append({"to": to, "subject": subj, "text": text_body, "unsubscribe": unsubscribe})
        return True

    monkeypatch.setattr(settings, "brevo_api_key", "test-key")
    monkeypatch.setattr(email, "send", fake_send)
    return sent


def _token(message: dict) -> str:
    return message["text"].split("token=", 1)[1].split()[0]


async def register(client, name, address=None):
    return await client.post("/auth/register", json={
        "email": address or f"{name}@example.com", "password": "password123", "display_name": name})


async def test_nothing_works_until_the_email_is_confirmed(client, confirmations):
    r = await register(client, "newcomer")
    assert r.status_code == 201 and r.json()["needs_email_check"] is True
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}

    blocked = await client.get("/feed", headers=h)
    assert blocked.status_code == 403 and blocked.json()["detail"] == "email_unconfirmed"
    me = await client.get("/users/me", headers=h)  # still allowed, so the app knows what to show
    assert me.status_code == 200 and me.json()["needs_email_check"] is True

    [message] = confirmations
    assert message["to"] == "newcomer@example.com" and "/verify?token=" in message["text"]
    assert message["unsubscribe"] is None  # account mail, not a newsletter

    assert (await client.post("/auth/verify-email", json={"token": _token(message)})).status_code == 204
    assert (await client.get("/feed", headers=h)).status_code == 200
    assert (await client.get("/users/me", headers=h)).json()["needs_email_check"] is False
    # Links work once.
    assert (await client.post("/auth/verify-email", json={"token": _token(message)})).status_code == 400


async def test_resending_is_limited(client, confirmations, monkeypatch):
    monkeypatch.setattr(settings, "confirmation_emails_per_hour", 2)
    r = await register(client, "resender")
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.post("/auth/resend-confirmation", headers=h)).status_code == 204
    assert (await client.post("/auth/resend-confirmation", headers=h)).status_code == 204
    assert (await client.post("/auth/resend-confirmation", headers=h)).status_code == 429
    assert len(confirmations) == 3  # the sign-up email plus two resends
    # Any of the links confirms the account.
    assert (await client.post("/auth/verify-email", json={"token": _token(confirmations[0])})).status_code == 204


async def test_without_an_email_service_nobody_is_asked_to_confirm(client):
    assert not settings.brevo_api_key
    r = await register(client, "localdev")
    assert r.json()["needs_email_check"] is False
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/feed", headers=h)).status_code == 200


async def test_throwaway_and_undeliverable_addresses_are_turned_away(client, monkeypatch):
    monkeypatch.setattr(settings, "check_email_domains", True)
    mail = {"realmail.org": True, "typo-domain.cmo": False}

    async def takes_mail(domain):
        return mail.get(domain)

    monkeypatch.setattr(email_checks, "_takes_mail", takes_mail)
    monkeypatch.setattr(email_checks, "_canary", (float("inf"), True))

    r = await register(client, "burner", "x@mailinator.com")
    assert r.status_code == 422 and "permanent email" in r.json()["detail"]
    r = await register(client, "burner2", "x@sub.mailinator.com")
    assert r.status_code == 422
    r = await register(client, "typo", "x@typo-domain.cmo")
    assert r.status_code == 422 and "can’t receive mail" in r.json()["detail"]
    assert (await register(client, "real", "x@realmail.org")).status_code == 201
    # A lookup that fails (None) lets the person through; the confirmation link still checks.
    assert (await register(client, "unknown", "x@unreachable-dns.org")).status_code == 201


async def test_broken_dns_never_blocks_sign_up(client, monkeypatch):
    monkeypatch.setattr(settings, "check_email_domains", True)

    async def everything_missing(domain):
        return False  # what a broken resolver looks like: every domain "doesn't exist", even gmail.com

    monkeypatch.setattr(email_checks, "_takes_mail", everything_missing)
    monkeypatch.setattr(email_checks, "_canary", (0.0, False))
    assert (await register(client, "luckyone", "x@gmail.com")).status_code == 201
