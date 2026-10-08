"""Districts and representatives: "who represents me?", districts people follow, and per-state lists.

Privacy: a user's location is only used to look up their district (POST /users/me/home/locate, in the
request body so it never lands in access logs) and is then discarded. Only the state and district
number are stored, and they're never shown on the user's public profile.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.deps import DB, CurrentUser
from app.models import DistrictFollow, Legislator, User
from app.schemas import DistrictOut, HomeIn, LegislatorBase, LocationIn, RepresentativesOut, StateDistrictsOut
from app.services import district_maps

router = APIRouter(tags=["places"])

# Non-voting delegates and the resident commissioner (district 0 covers the whole territory).
TERRITORIES = {"DC", "PR", "GU", "VI", "AS", "MP"}


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _state_name(state: str) -> str:
    data = district_maps.load(state)
    return data["name"] if data else state


def _district(state: str, district: int, rep: Legislator | None, home: User, following: set) -> DistrictOut:
    name = _state_name(state)
    if district:
        title = f"{name}'s {ordinal(district)} District"
    else:
        title = f"{name} (delegate)" if state in TERRITORIES else f"{name} at-large"
    return DistrictOut(
        state=state,
        district=district,
        label=f"{state}-{district}" if district else f"{state}-AL",
        name=title,
        representative=LegislatorBase.model_validate(rep) if rep else None,
        is_home=(home.home_state, home.home_district) == (state, district),
        is_following=(state, district) in following,
    )


def _check_district(state: str, district: int) -> str:
    state = state.upper()
    if district not in district_maps.district_keys(state):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such district")
    return state


async def _representatives(db, pairs: list[tuple[str, int]]) -> dict[tuple[str, int], Legislator]:
    """The serving House member for each (state, district); vacant seats are left out."""
    if not pairs:
        return {}
    states = {s for s, _ in pairs}
    reps = await db.scalars(
        select(Legislator).where(
            Legislator.in_office.is_(True), Legislator.chamber == "house", Legislator.state.in_(states)
        )
    )
    return {(r.state, r.district or 0): r for r in reps}


async def _senators(db, state: str) -> list[Legislator]:
    return list(await db.scalars(
        select(Legislator)
        .where(Legislator.in_office.is_(True), Legislator.chamber == "senate", Legislator.state == state)
        .order_by(Legislator.last_name)
    ))


async def _following(db, user: User) -> set[tuple[str, int]]:
    rows = await db.execute(
        select(DistrictFollow.state, DistrictFollow.district).where(DistrictFollow.user_id == user.id)
    )
    return {(s, d) for s, d in rows}


@router.get("/districts/{state}", response_model=StateDistrictsOut)
async def state_districts(state: str, db: DB, user: CurrentUser):
    """Every district in a state with its representative, plus the state's senators."""
    state = state.upper()
    keys = district_maps.district_keys(state)
    if not keys:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such state")
    reps = await _representatives(db, [(state, d) for d in keys])
    following = await _following(db, user)
    return StateDistrictsOut(
        state=state,
        name=_state_name(state),
        senators=[LegislatorBase.model_validate(s) for s in await _senators(db, state)],
        districts=[_district(state, d, reps.get((state, d)), user, following) for d in keys],
    )


@router.post("/districts/{state}/{district}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_district(state: str, district: int, db: DB, user: CurrentUser):
    state = _check_district(state, district)
    if not await db.get(DistrictFollow, (user.id, state, district)):
        db.add(DistrictFollow(user_id=user.id, state=state, district=district))
        await db.commit()


@router.delete("/districts/{state}/{district}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_district(state: str, district: int, db: DB, user: CurrentUser):
    await db.execute(delete(DistrictFollow).where(
        DistrictFollow.user_id == user.id, DistrictFollow.state == state.upper(), DistrictFollow.district == district
    ))
    await db.commit()


@router.get("/users/me/districts", response_model=list[DistrictOut])
async def my_districts(db: DB, user: CurrentUser):
    """Districts the user follows, in the order they followed them."""
    pairs = [(s, d) for s, d in await db.execute(
        select(DistrictFollow.state, DistrictFollow.district)
        .where(DistrictFollow.user_id == user.id).order_by(DistrictFollow.created_at)
    )]
    reps = await _representatives(db, pairs)
    return [_district(s, d, reps.get((s, d)), user, set(pairs)) for s, d in pairs]


@router.get("/users/me/representatives", response_model=RepresentativesOut)
async def my_representatives(db: DB, user: CurrentUser):
    if not user.home_state:
        return RepresentativesOut(home=None, senators=[])
    pair = (user.home_state, user.home_district or 0)
    reps = await _representatives(db, [pair])
    return RepresentativesOut(
        home=_district(*pair, reps.get(pair), user, await _following(db, user)),
        senators=[LegislatorBase.model_validate(s) for s in await _senators(db, user.home_state)],
    )


@router.post("/users/me/home/locate", response_model=RepresentativesOut)
async def locate_home(body: LocationIn, db: DB, user: CurrentUser):
    """Sets the user's district from their location. The coordinates are not stored or logged."""
    found = district_maps.locate(body.latitude, body.longitude)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That location isn't in a U.S. congressional district")
    user.home_state, user.home_district = found
    await db.commit()
    return await my_representatives(db, user)


@router.put("/users/me/home", response_model=RepresentativesOut)
async def set_home(body: HomeIn, db: DB, user: CurrentUser):
    """Sets the user's district by hand, e.g. picked on the map."""
    user.home_state, user.home_district = _check_district(body.state, body.district), body.district
    await db.commit()
    return await my_representatives(db, user)


@router.delete("/users/me/home", status_code=status.HTTP_204_NO_CONTENT)
async def clear_home(db: DB, user: CurrentUser):
    user.home_state = user.home_district = None
    await db.commit()

