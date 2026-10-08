import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models import Bill, BillFollow, Comment, CommentVote, Legislator, User, Vote
from app.schemas import BillOut, CommentOut


def sponsor_label(legislator: Legislator) -> str:
    """ "Kim Schrier (D-WA-8)"; senators and at-large members get just the state, e.g. "(D-MA)"."""
    seat = legislator.state or ""
    if legislator.chamber == "house" and legislator.district:
        seat += f"-{legislator.district}"
    return f"{legislator.name} ({legislator.party or '?'}-{seat})" if seat else legislator.name


async def bills_out(
    db: AsyncSession, user: User, bills: list[Bill], extra: dict[uuid.UUID, dict] | None = None
) -> list[BillOut]:
    """`extra` adds per-bill fields, e.g. the feed's `reason` or a search `snippet`."""
    ids = [b.id for b in bills]
    votes = dict((await db.execute(
        select(Vote.bill_id, Vote.value).where(Vote.user_id == user.id, Vote.bill_id.in_(ids))
    )).all())
    followed = set(await db.scalars(
        select(BillFollow.bill_id).where(BillFollow.user_id == user.id, BillFollow.bill_id.in_(ids))
    ))
    sponsor_ids = {b.sponsor_id for b in bills if b.sponsor_id}
    sponsors = {
        m.bioguide_id: sponsor_label(m)
        for m in await db.scalars(select(Legislator).where(Legislator.bioguide_id.in_(sponsor_ids)))
    } if sponsor_ids else {}
    return [
        BillOut.model_validate(b).model_copy(update={
            "my_vote": votes.get(b.id, 0),
            # Bills whose sponsor isn't linked (e.g. demo data) keep Congress.gov's raw name.
            "sponsor_label": sponsors.get(b.sponsor_id) or b.sponsor_name,
            "is_following": b.id in followed,
            **(extra or {}).get(b.id, {}),
        })
        for b in bills
    ]


def visible_comments(viewer: User) -> ColumnElement[bool]:
    """Hidden comments and shadow-banned users' comments are visible only to their author."""
    banned = select(User.id).where(User.is_shadow_banned.is_(True))
    return or_(
        Comment.user_id == viewer.id,
        (Comment.is_hidden.is_(False)) & (Comment.user_id.not_in(banned)),
    )


async def comments_out(db: AsyncSession, viewer: User, comments: list[Comment]) -> list[CommentOut]:
    ids: list[uuid.UUID] = [c.id for c in comments]
    votes = dict((await db.execute(
        select(CommentVote.comment_id, CommentVote.value)
        .where(CommentVote.user_id == viewer.id, CommentVote.comment_id.in_(ids))
    )).all())
    return [
        CommentOut(
            id=c.id,
            bill_id=c.bill_id,
            parent_comment_id=c.parent_comment_id,
            author_id=c.user_id,
            author_name=c.user.display_name or "anonymous",
            body=c.body,
            net_score=c.net_score,
            my_vote=votes.get(c.id, 0),
            is_mine=c.user_id == viewer.id,
            is_flagged=c.is_flagged,
            is_hidden=c.is_hidden,
            created_at=c.created_at,
        )
        for c in comments
    ]
