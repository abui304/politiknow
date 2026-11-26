"""Recorded votes: on a bill, by a member of Congress, and by the user's own members."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import DB, CurrentUser
from app.models import Bill, Legislator, MemberVote, RollCall, bill_label
from app.routers.bills import _published_bill
from app.schemas import MemberVoteOut, MemberVotesPage, MyMembersVotesOut, RollCallOut
from app.services.notify import ALERT_VOTE_KINDS, members_of
from app.services.votes import with_members

router = APIRouter(tags=["votes"])

# Final passage first, then cloture, then the rest; newest first within each.
KIND_ORDER = {"passage": 0, "cloture": 1, "amendment": 2, "nomination": 3, "other": 4, "procedural": 5}


@router.get("/bills/{bill_id}/votes", response_model=list[RollCallOut])
async def bill_votes(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    """Every recorded vote on this bill: final passage first, procedural votes last. With "your members"
    when the user has a home district or follows members."""
    await _published_bill(db, bill_id)
    rcs = list(await db.scalars(select(RollCall).where(RollCall.bill_id == bill_id)))
    rcs.sort(key=lambda r: (KIND_ORDER.get(r.kind, 9), -r.voted_at.timestamp()))
    return await with_members(db, user, rcs)


@router.get("/legislators/{bioguide_id}/votes", response_model=MemberVotesPage)
async def legislator_votes(
    bioguide_id: str, db: DB, user: CurrentUser, cursor: int = 0, limit: int = Query(20, le=50),
    kind: str | None = Query(None, pattern="^(passage|cloture|amendment|nomination|procedural|other)$"),
):
    """A member's recorded votes, newest first, plus missed votes this Congress (count and denominator)."""
    if not await db.get(Legislator, bioguide_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Legislator not found")
    stmt = (
        select(MemberVote.position, RollCall, Bill.bill_type, Bill.bill_number, Bill.title, Bill.is_published)
        .join(RollCall, RollCall.id == MemberVote.roll_call_id)
        .outerjoin(Bill, Bill.id == RollCall.bill_id)
        .where(MemberVote.bioguide_id == bioguide_id)
        .order_by(RollCall.voted_at.desc())
    )
    if kind:
        stmt = stmt.where(RollCall.kind == kind)
    rows = list(await db.execute(stmt.offset(cursor).limit(limit + 1)))
    items = []
    for pos, rc, btype, bnum, title, published in rows[:limit]:
        linked = rc.bill_id if published else None
        items.append(MemberVoteOut(
            roll_call=RollCallOut.model_validate(rc), position=pos, bill_id=linked,
            bill_label=bill_label(btype, bnum) if btype else rc.measure, bill_title=title if published else None,
        ))
    latest_congress = select(func.max(RollCall.congress)).scalar_subquery()
    counts = (
        select(func.count(), func.count().filter(MemberVote.position == "Not Voting"))
        .join(RollCall, RollCall.id == MemberVote.roll_call_id)
        .where(MemberVote.bioguide_id == bioguide_id, RollCall.congress == latest_congress)
    )
    eligible, missed = (await db.execute(counts)).one()
    return MemberVotesPage(
        items=items, next_cursor=cursor + limit if len(rows) > limit else None, missed=missed, eligible=eligible
    )


@router.get("/users/me/members/votes", response_model=MyMembersVotesOut)
async def my_members_votes(db: DB, user: CurrentUser, limit: int = Query(10, le=30)):
    """Recent passage and cloture votes where at least one of the user's members voted."""
    ids = await members_of(db, user)
    if not ids:
        return MyMembersVotesOut(items=[])
    rcs = list(await db.scalars(
        select(RollCall)
        .where(
            RollCall.kind.in_(ALERT_VOTE_KINDS),
            RollCall.id.in_(select(MemberVote.roll_call_id).where(MemberVote.bioguide_id.in_(ids))),
        )
        .order_by(RollCall.voted_at.desc()).limit(limit)
    ))
    return MyMembersVotesOut(items=await with_members(db, user, rcs))

