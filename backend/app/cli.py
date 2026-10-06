"""Manual commands:
  python -m app.cli ingest      # run the Congress.gov ingestion once
  python -m app.cli trending    # recalculate trending once
  python -m app.cli seed-demo   # add sample bills + users for local UI work (no API keys needed)
  python -m app.cli normalize-hashtags  # merge spelling variants, drop generic hashtags (free)
  python -m app.cli retag       # regenerate every bill's hashtags so they reuse each other (OpenAI cost)
  python -m app.cli backfill-cosponsors  # fetch sponsor + cosponsor details for existing bills (free)
  python -m app.cli sync-members  # refresh every legislator's photo, career, and office (free)
  python -m app.cli build-maps    # rebuild app/data/maps from Census boundaries (free; dev requirements)
"""

import asyncio
import hashlib
import sys
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.db import worker_sessionmaker
from app.models import AuthProvider, Bill, Comment, User
from app.security import hash_password
from app.services import llm

# Real laws, with short descriptions standing in for full bill text. Demo data only.
DEMO_BILLS = [
    (117, "HR", 5376, "Inflation Reduction Act of 2022", "D", "Taxation", date(2022, 8, 16),
     "This bill aims to curb inflation by lowering prescription drug costs, promoting clean energy production through tax credits, and imposing a new minimum tax on large corporations. Key provisions include allowing Medicare to negotiate drug prices, investing in climate initiatives to reduce carbon emissions, and funding the IRS to increase tax enforcement."),
    (115, "HR", 1, "Tax Cuts and Jobs Act", "R", "Taxation", date(2017, 12, 22),
     "This act overhauls the U.S. tax code, cutting the corporate tax rate from 35% to 21% and temporarily reducing individual income tax rates across most brackets. It nearly doubles the standard deduction while limiting others, such as the deduction for state and local taxes (SALT)."),
    (111, "HR", 3590, "Patient Protection and Affordable Care Act", "D", "Health", date(2010, 3, 23),
     "This act overhauls the U.S. healthcare system to increase the number of insured Americans and decrease the overall cost of healthcare, through mandates, subsidies, and insurance exchanges. It offers tax credits to make insurance more affordable and expands Medicaid to cover more low-income adults."),
    (117, "HR", 1319, "American Rescue Plan Act of 2021", "D", "Economics and Public Finance", date(2021, 3, 11),
     "A COVID-19 relief package with direct stimulus payments to individuals, an extension of federal unemployment benefits, funding for state and local governments, and resources for vaccination programs and school reopenings. It also expands the child tax credit and aids small businesses."),
    (115, "S", 756, "First Step Act of 2018", "R", "Crime and Law Enforcement", date(2018, 12, 21),
     "A bipartisan criminal justice reform bill to reduce recidivism and the federal prison population. It applies the Fair Sentencing Act of 2010 retroactively, expands job training and rehabilitative programs for inmates, and revises mandatory minimum sentencing laws."),
    (107, "HR", 3162, "USA PATRIOT Act", "R", "Crime and Law Enforcement", date(2001, 10, 26),
     "Enacted after the September 11th attacks, this act expanded the surveillance powers of U.S. law enforcement and intelligence agencies, allowing increased wiretapping, monitoring of internet communications, and access to records, and improved information sharing for terrorism investigations."),
]

DEMO_USERS = ["civic_owl", "ballot_bunny", "policy_panda"]
DEMO_PASSWORD = "politiknow123"


async def seed_demo(db) -> None:
    for congress, btype, number, title, party, area, when, text in DEMO_BILLS:
        exists = await db.scalar(select(Bill.id).where(
            Bill.congress_number == congress, Bill.bill_type == btype, Bill.bill_number == number))
        if exists:
            continue
        simple, detailed = await llm.summarize(title, text)
        tags = await llm.generate_tags(title, text, area)
        db.add(Bill(
            congress_number=congress, bill_type=btype, bill_number=number, title=title,
            full_text=text, summary_simple=simple, summary_detailed=detailed,
            primary_tags=tags.primary, sub_tags=tags.sub, sponsor_party=party,
            sponsor_name=f"Demo sponsor [{party}]", status="became_law",
            latest_action_text="Became Public Law.", is_published=True,
            congress_url=f"https://www.congress.gov/bill/{congress}th-congress/"
                         f"{'house' if btype == 'HR' else 'senate'}-bill/{number}",
            introduced_date=when, last_action_date=datetime.combine(when, datetime.min.time(), UTC),
            version_hash=hashlib.sha256(text.encode()).hexdigest(),
        ))
        print(f"  + {btype} {number} {title}")
    await db.flush()

    password_hash = hash_password(DEMO_PASSWORD)
    users = []
    for name in DEMO_USERS:
        user = await db.scalar(select(User).where(User.display_name == name))
        if not user:
            user = User(
                email=f"{name}@example.com", display_name=name, password_hash=password_hash,
                auth_provider=AuthProvider.email, onboarding_tags=["Health", "Taxation", "Education",
                                                                   "Energy", "Immigration"],
                # Backdated so the 1-hour comment age gate doesn't block demo accounts.
                created_at=datetime.now(UTC) - timedelta(days=2),
            )
            db.add(user)
            print(f"  + user {name} / {DEMO_PASSWORD}")
        users.append(user)
    await db.flush()

    aca = await db.scalar(select(Bill).where(Bill.bill_type == "HR", Bill.bill_number == 3590))
    if aca and not await db.scalar(select(Comment.id).where(Comment.bill_id == aca.id)):
        top = Comment(user_id=users[0].id, bill_id=aca.id, body="The simple summary really helped me get this one!")
        db.add(top)
        await db.flush()
        db.add(Comment(user_id=users[1].id, bill_id=aca.id, parent_comment_id=top.id, body="Same, the detailed one too."))
        aca.comment_count = 2
    await db.commit()
    print("Demo data ready.")


async def retag(db) -> None:
    """Regenerate hashtags for every published bill, oldest first, each run reusing the hashtags
    of the bills before it. Primary topics are left alone. One OpenAI call per bill."""
    from app.services import hashtags

    bills = list(await db.scalars(
        select(Bill).where(Bill.is_published.is_(True), Bill.full_text.is_not(None)).order_by(Bill.ingested_at)
    ))
    vocab: dict[str, str] = {}
    for i, b in enumerate(bills, 1):
        tags = await llm.generate_tags(b.title, b.full_text, None, list(vocab.values()))
        b.sub_tags = hashtags.canonicalize(tags.sub, vocab)
        await db.commit()
        print(f"  [{i}/{len(bills)}] {b.label}: {', '.join(b.sub_tags)}")
    shared = await hashtags.popular(db, limit=1000)
    print(f"Done. {len(shared)} hashtags are now shared by 2+ bills.")


async def backfill_cosponsors(db) -> None:
    """Fetch sponsor and cosponsor details for bills ingested before they were tracked.
    Congress.gov calls only (free): one per bill, plus one per 250 cosponsors."""
    from app.services import legislators
    from app.services.congress import CongressClient

    api = CongressClient()
    keys = (await db.execute(
        select(Bill.id, Bill.congress_number, Bill.bill_type, Bill.bill_number).order_by(Bill.ingested_at)
    )).all()
    failed = 0
    try:
        for i, (bill_id, congress, bill_type, number) in enumerate(keys, 1):
            try:
                bill = await db.get(Bill, bill_id)
                await legislators.sync_bill(db, api, bill, await api.bill_detail(congress, bill_type, number))
                await db.commit()
                print(f"  [{i}/{len(keys)}] {bill.label}: {bill.cosponsor_count} cosponsors")
            except Exception as e:
                await db.rollback()
                failed += 1
                print(f"  [{i}/{len(keys)}] {bill_type} {number} failed: {e}")
    finally:
        await api.close()
    print(f"Done. {len(keys) - failed} bills updated, {failed} failed.")


async def main(cmd: str) -> None:
    if cmd == "build-maps":
        from app.services import district_maps
        print(f"Wrote {district_maps.build()} state maps to {district_maps.MAPS_DIR}")
        return
    sessions = worker_sessionmaker()
    async with sessions() as db:
        if cmd == "ingest":
            from app.services.ingest import run_ingestion
            print(await run_ingestion(db))
        elif cmd == "trending":
            from app.services.trending import recalculate
            print(await recalculate(db))
        elif cmd == "seed-demo":
            await seed_demo(db)
        elif cmd == "normalize-hashtags":
            from app.services import hashtags
            print(f"Cleaned hashtags on {await hashtags.normalize_all(db)} bills.")
        elif cmd == "retag":
            await retag(db)
        elif cmd == "backfill-cosponsors":
            await backfill_cosponsors(db)
        elif cmd == "sync-members":
            from app.services import legislators
            from app.services.congress import CongressClient

            api = CongressClient()
            try:
                print(f"Updated {await legislators.sync_members(db, api)} legislators.")
            finally:
                await api.close()
        else:
            print(__doc__)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else ""))
