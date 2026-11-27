"""Links to official pages on Congress.gov."""

CONGRESS_GOV_TYPES = {
    "HR": "house-bill", "S": "senate-bill", "HJRES": "house-joint-resolution", "SJRES": "senate-joint-resolution",
    "HCONRES": "house-concurrent-resolution", "SCONRES": "senate-concurrent-resolution",
    "HRES": "house-resolution", "SRES": "senate-resolution",
}


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def congress_gov_url(congress: int, bill_type: str, number: int) -> str:
    kind = CONGRESS_GOV_TYPES.get(bill_type, "bill")
    return f"https://www.congress.gov/bill/{_ordinal(congress)}-congress/{kind}/{number}"
