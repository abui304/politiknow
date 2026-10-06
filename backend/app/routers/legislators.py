import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select

from app.deps import DB, CurrentUser
from app.models import Bill, BillCosponsor, Legislator
from app.routers.bills import _published_bill
from app.schemas import BillPage, CosponsorOut, LegislatorBase, LegislatorOut
from app.serializers import bills_out
from app.services import district_maps
from app.services.legislators import PARTY_CODES, like_pattern, name_matches

router = APIRouter(tags=["legislators"])


def _with_counts():
    """Legislators with how many published bills they sponsored and cosponsored."""
    published = Bill.is_published.is_(True)
    sponsored = (
        select(Bill.sponsor_id.label("bid"), func.count().label("n"))
        .where(published).group_by(Bill.sponsor_id).subquery()
    )
    cosponsored = (
        select(BillCosponsor.bioguide_id.label("bid"), func.count().label("n"))
        .join(Bill, Bill.id == BillCosponsor.bill_id)
        .where(published).group_by(BillCosponsor.bioguide_id).subquery()
    )
    s_n = func.coalesce(sponsored.c.n, 0)
    c_n = func.coalesce(cosponsored.c.n, 0)
    stmt = (
        select(Legislator, s_n, c_n)
        .outerjoin(sponsored, sponsored.c.bid == Legislator.bioguide_id)
        .outerjoin(cosponsored, cosponsored.c.bid == Legislator.bioguide_id)
    )
    return stmt, s_n, c_n


def _out(row) -> LegislatorOut:
    legislator, s_n, c_n = row
    return LegislatorOut.model_validate(
        {**{f: getattr(legislator, f) for f in LegislatorOut.model_fields if hasattr(legislator, f)},
         "sponsored_count": s_n, "cosponsored_count": c_n}
    )


@router.get("/legislators", response_model=list[LegislatorOut])
async def list_legislators(
    db: DB,
    _: CurrentUser,
    q: str | None = Query(None, max_length=100),
    party: Literal["D", "R", "I"] | None = None,
    chamber: Literal["house", "senate"] | None = None,
    limit: int = Query(20, le=100),
):
    """Members with at least one published bill, most active first. `q` matches their name."""
    stmt, s_n, c_n = _with_counts()
    stmt = stmt.where(s_n + c_n > 0)
    if term := (q or "").strip():
        stmt = stmt.where(name_matches(like_pattern(term)))
    if party:
        stmt = stmt.where(Legislator.party.in_(PARTY_CODES[party]))
    if chamber:
        stmt = stmt.where(Legislator.chamber == chamber)
    rows = await db.execute(stmt.order_by((s_n + c_n).desc(), Legislator.last_name).limit(limit))
    return [_out(row) for row in rows]


@router.get("/legislators/{bioguide_id}", response_model=LegislatorOut)
async def get_legislator(bioguide_id: str, db: DB, _: CurrentUser):
    stmt, _s, _c = _with_counts()
    row = (await db.execute(stmt.where(Legislator.bioguide_id == bioguide_id))).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Legislator not found")
    return _out(row)


@router.get("/legislators/{bioguide_id}/bills", response_model=BillPage)
async def legislator_bills(
    bioguide_id: str,
    db: DB,
    user: CurrentUser,
    role: Literal["all", "sponsored", "cosponsored"] = "all",
    cursor: int = 0,
    limit: int = Query(20, le=50),
):
    sponsored = Bill.sponsor_id == bioguide_id
    cosponsored = Bill.id.in_(select(BillCosponsor.bill_id).where(BillCosponsor.bioguide_id == bioguide_id))
    match = {"all": or_(sponsored, cosponsored), "sponsored": sponsored, "cosponsored": cosponsored}[role]
    stmt = (
        select(Bill).where(Bill.is_published.is_(True), match)
        .order_by(Bill.last_action_date.desc().nulls_last(), Bill.id)
    )
    bills = list(await db.scalars(stmt.offset(cursor).limit(limit + 1)))
    next_cursor = cursor + limit if len(bills) > limit else None
    return BillPage(items=await bills_out(db, user, bills[:limit]), next_cursor=next_cursor)


@router.get("/maps/{state}")
async def state_map(state: str, response: Response):
    """Pre-drawn state + district map (see services/district_maps). Public data, cached a day."""
    data = district_maps.load(state)
    if not data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No map for that state")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return data


@router.get("/bills/{bill_id}/cosponsors", response_model=list[CosponsorOut])
async def bill_cosponsors(bill_id: uuid.UUID, db: DB, _: CurrentUser):
    """Current cosponsors: original cosponsors first, then in the order they signed on."""
    bill = await _published_bill(db, bill_id)
    rows = await db.scalars(
        select(BillCosponsor)
        .join(Legislator)
        .where(BillCosponsor.bill_id == bill.id)
        .order_by(
            BillCosponsor.is_original.desc(),
            BillCosponsor.sponsorship_date.nulls_last(),
            Legislator.last_name,
        )
    )
    return [
        CosponsorOut(
            **LegislatorBase.model_validate(c.legislator).model_dump(),
            is_original=c.is_original,
            sponsorship_date=c.sponsorship_date,
        )
        for c in rows
    ]

