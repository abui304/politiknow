"""Post-publish moderation (spec 7.1, 7.3). Comments go live immediately; the AI check
runs in the background and can flag (stays visible, queued for review) or hide them."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Bill, Comment, CommentReport, User
from app.services import llm


async def hide(db: AsyncSession, comment: Comment) -> None:
    if comment.is_hidden:
        return
    comment.is_hidden = True
    comment.is_flagged = True  # escalate for manual review
    bill = await db.get(Bill, comment.bill_id)
    if bill:
        bill.comment_count = max(bill.comment_count - 1, 0)
    await _maybe_shadow_ban(db, comment.user_id)


async def _maybe_shadow_ban(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Repeat offenders: content becomes visible only to themselves."""
    hidden = await db.scalar(
        select(func.count()).where(Comment.user_id == user_id, Comment.is_hidden.is_(True))
    ) or 0
    if hidden >= settings.shadow_ban_after_hidden:  # autoflush includes the comment just hidden
        user = await db.get(User, user_id)
        if user:
            user.is_shadow_banned = True


async def moderate_comment(db: AsyncSession, comment_id: uuid.UUID) -> None:
    comment = await db.get(Comment, comment_id)
    if not comment:
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
    reports = await db.scalar(
        select(func.count()).where(CommentReport.comment_id == comment.id)
    ) or 0
    if reports >= settings.reports_to_hide:
        await hide(db, comment)
