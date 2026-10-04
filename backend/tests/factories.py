import itertools
from datetime import UTC, datetime, timedelta

from app.models import Bill

_numbers = itertools.count(1)


async def make_bill(db, *, tags=("Health",), days_ago=1, party="D", trending=False, title=None) -> Bill:
    n = next(_numbers)
    bill = Bill(
        congress_number=119, bill_type="HR", bill_number=n, title=title or f"Test Bill {n}",
        summary_simple="simple", summary_detailed="detailed", full_text="text",
        primary_tags=list(tags), sub_tags=[], sponsor_party=party, is_published=True,
        is_trending=trending, last_action_date=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db.add(bill)
    await db.commit()
    return bill
