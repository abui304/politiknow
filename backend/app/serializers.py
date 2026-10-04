import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models import Bill, Comment, CommentVote, User, Vote
from app.schemas import BillOut, CommentOut


async def bills_out(db: AsyncSession, user: User, bills: list[Bill]) -> list[BillOut]:
    votes = dict((await db.execute(
        select(Vote.bill_id, Vote.value).where(Vote.user_id == user.id, Vote.bill_id.in_([b.id for b in bills]))
    )).all())
    return [BillOut.model_validate(b).model_copy(update={"my_vote": votes.get(b.id, 0)}) for b in bills]


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
