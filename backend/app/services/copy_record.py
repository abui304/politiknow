"""Copies the public record (bills with their summaries, members, cosponsors, roll-call votes) from this
database to another one, usually local → hosted at launch, so bills already summarized aren't paid for twice.

Never copied: accounts, comments, votes, follows, alerts or any other personal data, and bills added by
`seed-demo`. Counters that come from people (scores, comment counts, trending) start at zero on the target.
Safe to run again: rows the target already has are left alone.
"""

import logging
import uuid
from collections.abc import Iterable

from sqlalchemy import Table, select, text, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import async_database_url, settings
from app.models import Bill, BillCosponsor, IngestState, Legislator, MemberVote, RollCall

log = logging.getLogger(__name__)

DEMO_SPONSOR = "Demo sponsor [%"
PEOPLE_COUNTERS = {"net_score": 0, "comment_count": 0, "is_trending": False, "trending_score": 0.0}


def _columns(table: Table) -> list[str]:
    return [c.name for c in table.columns if c.computed is None]


def _batches(rows: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


async def _insert(conn: AsyncConnection, table: Table, rows: list[dict], size: int = 500) -> int:
    added = 0
    for batch in _batches(rows, size):
        result = await conn.execute(insert(table).values(batch).on_conflict_do_nothing())
        added += result.rowcount or 0
    return added


async def _rows(conn: AsyncConnection, stmt) -> list[dict]:
    return [dict(r._mapping) for r in await conn.execute(stmt)]


async def copy_public_record(target_url: str, out=print) -> dict[str, int]:
    """Copies from this app's database (DATABASE_URL) to `target_url`. Returns rows added per table."""
    target_url = async_database_url(target_url)
    if target_url == settings.database_url:
        raise SystemExit("The target is this same database. Pass the hosted database's address.")
    no_cache = {"statement_cache_size": 0, "prepared_statement_cache_size": 0}
    source = create_async_engine(settings.database_url, poolclass=NullPool, connect_args=no_cache)
    target = create_async_engine(target_url, poolclass=NullPool, connect_args=no_cache)
    added: dict[str, int] = {}
    try:
        async with source.connect() as src, target.begin() as dst:
            here = await src.scalar(text("select version_num from alembic_version"))
            try:
                there = await dst.scalar(text("select version_num from alembic_version"))
            except Exception:
                there = None
            if here != there:
                raise SystemExit(
                    f"The two databases are on different versions ({here} here, {there} there). "
                    "Run `alembic upgrade head` on both (or the `migrate` job), then try again."
                )

            legislators = Legislator.__table__
            rows = await _rows(src, select(*[legislators.c[n] for n in _columns(legislators)]))
            added["legislators"] = await _insert(dst, legislators, rows)
            out(f"  members: {added['legislators']} added ({len(rows)} here)")

            bills = Bill.__table__
            rows = await _rows(
                src,
                select(*[bills.c[n] for n in _columns(bills)]).where(
                    bills.c.sponsor_name.is_(None) | bills.c.sponsor_name.not_like(DEMO_SPONSOR)
                ),
            )
            for row in rows:
                row.update(PEOPLE_COUNTERS)
            added["bills"] = await _insert(dst, bills, rows, size=50)
            out(f"  bills: {added['bills']} added ({len(rows)} here, demo bills left out)")

            # The target may already have some of these bills under its own ids (an ingest ran there first):
            # point everything at the target's copy.
            keys = {(r["congress_number"], r["bill_type"], r["bill_number"]): r["id"] for r in rows}
            id_map: dict[uuid.UUID, uuid.UUID] = {}
            for batch in _batches(list(keys), 1000):
                for c, t, n, target_id in await dst.execute(
                    select(bills.c.congress_number, bills.c.bill_type, bills.c.bill_number, bills.c.id).where(
                        tuple_(bills.c.congress_number, bills.c.bill_type, bills.c.bill_number).in_(batch)
                    )
                ):
                    id_map[keys[(c, t, n)]] = target_id

            cosponsors = BillCosponsor.__table__
            rows = [
                {**r, "bill_id": id_map[r["bill_id"]]}
                for r in await _rows(src, select(*[cosponsors.c[n] for n in _columns(cosponsors)]))
                if r["bill_id"] in id_map
            ]
            added["bill_cosponsors"] = await _insert(dst, cosponsors, rows)
            out(f"  cosponsors: {added['bill_cosponsors']} added")

            roll_calls = RollCall.__table__
            rows = await _rows(src, select(*[roll_calls.c[n] for n in _columns(roll_calls)]))
            for row in rows:
                row["bill_id"] = id_map.get(row["bill_id"]) if row["bill_id"] else None
            added["roll_calls"] = await _insert(dst, roll_calls, rows, size=200)
            # Same idea as bills: a vote the target already has keeps its own id.
            vote_keys = {(r["chamber"], r["congress"], r["session"], r["number"]): r["id"] for r in rows}
            vote_map: dict[uuid.UUID, uuid.UUID] = {}
            for batch in _batches(list(vote_keys), 1000):
                for ch, c, s, n, target_id in await dst.execute(
                    select(roll_calls.c.chamber, roll_calls.c.congress, roll_calls.c.session, roll_calls.c.number,
                           roll_calls.c.id).where(
                        tuple_(roll_calls.c.chamber, roll_calls.c.congress, roll_calls.c.session,
                               roll_calls.c.number).in_(batch)
                    )
                ):
                    vote_map[vote_keys[(ch, c, s, n)]] = target_id
            out(f"  roll-call votes: {added['roll_calls']} added")

            member_votes = MemberVote.__table__
            rows = [
                {**r, "roll_call_id": vote_map[r["roll_call_id"]]}
                for r in await _rows(src, select(*[member_votes.c[n] for n in _columns(member_votes)]))
                if r["roll_call_id"] in vote_map
            ]
            added["member_votes"] = await _insert(dst, member_votes, rows, size=2000)
            out(f"  members' votes: {added['member_votes']} added")

            # Where ingestion left off, so the hosted jobs carry on from here instead of starting over.
            state = IngestState.__table__
            rows = await _rows(src, select(state.c.key, state.c.value))
            added["ingest_state"] = await _insert(dst, state, rows)
            out(f"  ingestion progress: {added['ingest_state']} markers added")
    finally:
        await source.dispose()
        await target.dispose()
    return added
