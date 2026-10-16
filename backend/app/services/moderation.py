"""Post-publish moderation (spec 7.1, 7.3). Comments go live immediately; the AI check
runs in the background and can flag (stays visible, queued for review) or hide them.
Moderators review the queue from the dashboard (routers/moderation.py)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.config import settings
from app.models import Bill, Comment, CommentReport, User
from app.services import llm


async def recount_comments(db: AsyncSession, bill: Bill) -> None:
    """A bill's comment count only includes comments everyone can see."""
    banned = select(User.id).where(User.is_shadow_banned.is_(True))
    bill.comment_count = await db.scalar(
        select(func.count()).where(
            Comment.bill_id == bill.id, Comment.is_hidden.is_(False), Comment.user_id.not_in(banned)
        )
    ) or 0


async def hide(db: AsyncSession, comment: Comment) -> None:
    if comment.is_hidden:
        return
    comment.is_hidden = True
    comment.is_flagged = True  # escalate for manual review
    bill = await db.get(Bill, comment.bill_id)
    if bill:
        bill.comment_count = max(bill.comment_count - 1, 0)
    await _maybe_shadow_ban(db, comment.user_id)


async def set_shadow_ban(db: AsyncSession, user: User, banned: bool) -> None:
    if user.is_shadow_banned == banned:
        return
    user.is_shadow_banned = banned
    await db.flush()
    commented_on = select(Comment.bill_id).where(Comment.user_id == user.id)
    for bill in await db.scalars(select(Bill).where(Bill.id.in_(commented_on)).options(load_only(Bill.comment_count))):
        await recount_comments(db, bill)


async def _maybe_shadow_ban(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Repeat offenders: content becomes visible only to themselves."""
    hidden = await db.scalar(
        select(func.count()).where(Comment.user_id == user_id, Comment.is_hidden.is_(True))
    ) or 0
    if hidden >= settings.shadow_ban_after_hidden:  # autoflush includes the comment just hidden
        user = await db.get(User, user_id)
        if user:
            await set_shadow_ban(db, user, True)


async def moderate_comment(db: AsyncSession, comment_id: uuid.UUID) -> None:
    comment = await db.get(Comment, comment_id)
    if not comment or comment.reviewed_at:  # a moderator already decided
        return
    result = await llm.moderate(comment.body)
    if result and result.flagged:
        comment.is_flagged = True
        if result.max_score > settings.auto_hide_confidence:
            await hide(db, comment)
    await db.commit()


async def is_duplicate_spam(db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, body: str) -> bool:
    """Identical comment text from the same user on a different bill."""
    return bool(await db.scalar(
        select(func.count()).where(
            Comment.user_id == user_id,
            Comment.bill_id != bill_id,
            func.lower(func.trim(Comment.body)) == body.strip().lower(),
        )
    ))


async def handle_report(db: AsyncSession, comment: Comment) -> None:
    query = select(func.count()).where(CommentReport.comment_id == comment.id)
    if comment.reviewed_at:
        query = query.where(CommentReport.created_at > comment.reviewed_at)
    if (await db.scalar(query) or 0) >= settings.reports_to_hide:
        await hide(db, comment)


async def approve(db: AsyncSession, comment: Comment) -> None:
    """Moderator decision: the comment stays up (or comes back), and existing reports stop counting."""
    comment.is_flagged = False
    comment.reviewed_at = datetime.now(UTC)
    if comment.is_hidden:
        comment.is_hidden = False
        await db.flush()
        await recount_comments(db, await db.get(Bill, comment.bill_id))


async def remove(db: AsyncSession, comment: Comment) -> None:
    """Moderator decision: hide the comment. Counts toward the author's shadow ban like any hidden comment."""
    await hide(db, comment)
    comment.reviewed_at = datetime.now(UTC)
