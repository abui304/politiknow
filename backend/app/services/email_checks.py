"""Sign-up checks on an email address, before an account is made: its domain must be able to receive mail
and mustn't be a throwaway inbox service. The confirmation link then proves the person owns the address.

The mail check only turns someone away on a definite answer (the domain doesn't exist, or says it takes no
mail). If the lookup itself fails, or DNS looks broken, the person is let through: the confirmation link
still has to be clicked before the account can be used.
"""

import logging
import time

import dns.asyncresolver
import dns.exception
import dns.resolver
from disposable_email_domains import blocklist

from app.config import settings

log = logging.getLogger(__name__)

THROWAWAY = "Please use a permanent email address. Throwaway inboxes can’t be used for PolitiKNOW accounts."
UNDELIVERABLE = "That email address can’t receive mail. Check it for typos."

# A domain that always has mail servers. If it can't be found either, DNS is down, not the person's domain.
CANARY = "gmail.com"
_canary: tuple[float, bool] = (0.0, False)


def _domain_parts(domain: str) -> list[str]:
    """example.co.uk → [example.co.uk, co.uk], so subdomains of a throwaway service are caught too."""
    labels = domain.split(".")
    return [".".join(labels[i:]) for i in range(len(labels) - 1)]


def is_throwaway(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    return any(part in blocklist for part in _domain_parts(domain))


async def _takes_mail(domain: str) -> bool | None:
    """True if the domain can receive mail, False if it definitely can't, None if the lookup failed."""
    resolver = dns.asyncresolver.Resolver()
    resolver.lifetime = settings.email_dns_timeout
    try:
        answer = await resolver.resolve(domain, "MX")
        # A "null MX" (one record pointing at ".") is a domain saying it accepts no mail (RFC 7505).
        return not all(str(r.exchange) == "." for r in answer)
    except dns.resolver.NXDOMAIN:
        return False
    except dns.resolver.NoAnswer:
        pass  # No MX record: mail goes to the domain's own address, if it has one.
    except dns.exception.DNSException:
        return None
    for kind in ("A", "AAAA"):
        try:
            await resolver.resolve(domain, kind)
            return True
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except dns.exception.DNSException:
            return None
    return False


async def _dns_works() -> bool:
    global _canary
    checked_at, ok = _canary
    if time.monotonic() - checked_at < 600:
        return ok
    ok = bool(await _takes_mail(CANARY))
    _canary = (time.monotonic(), ok)
    if not ok:
        log.warning("DNS lookups are failing; skipping the email domain check")
    return ok


async def problem_with(email: str) -> str | None:
    """A message to show if this address can't be used for a new account, otherwise None."""
    if not settings.check_email_domains:
        return None
    if is_throwaway(email):
        return THROWAWAY
    domain = email.rsplit("@", 1)[-1].lower()
    if await _takes_mail(domain) is False and await _dns_works():
        return UNDELIVERABLE
    return None
