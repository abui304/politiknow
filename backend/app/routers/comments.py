import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.deps import DB, CurrentUser, RedisDep
from app.models import Bill, Comment, CommentReport, CommentVote, InteractionType, User
from app.ratelimit import enforce_hourly_limit
from app.routers.bills import _published_bill
from app.schemas import CommentIn, CommentOut, ReportIn, VoteIn, VoteOut
from app.serializers import comments_out, visible_comments
from app.services import interactions, moderation

router = APIRouter(tags=["comments"])
log = logging.getLogger(__name__)


def _enqueue(task_name: str, comment_id: uuid.UUID) -> None:
    """Background work must never block or fail the user's request."""
    from app import worker

    try:
        getattr(worker, task_name).delay(str(comment_id))
    except Exception:
        log.exception("Could not enqueue %s for comment %s", task_name, comment_id)


async def _recount(db, bill: Bill) -> None:
    banned = select(User.id).where(User.is_shadow_banned.is_(True))
    bill.comment_count = await db.scalar(
        select(func.count()).where(
            Comment.bill_id == bill.id, Comment.is_hidden.is_(False), Comment.user_id.not_in(banned)
        )
    ) or 0


@router.get("/bills/{bill_id}/comments", response_model=list[CommentOut])
async def list_comments(bill_id: uuid.UUID, db: DB, user: CurrentUser):
    await _published_bill(db, bill_id)
    comments = list(await db.scalars(
        select(Comment).where(Comment.bill_id == bill_id, visible_comments(user))
        .order_by(Comment.net_score.desc(), Comment.created_at.desc())
    ))
    outs = await comments_out(db, user, comments)
    top = [c for c in outs if c.parent_comment_id is None]
    by_id = {c.id: c for c in top}
    for c in sorted(outs, key=lambda c: c.created_at):
        if c.parent_comment_id in by_id:
            by_id[c.parent_comment_id].replies.append(c)
    return top


@router.post("/bills/{bill_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(bill_id: uuid.UUID, body: CommentIn, db: DB, redis: RedisDep, user: CurrentUser):
    bill = await _published_bill(db, bill_id)

    min_age = timedelta(minutes=settings.comment_min_account_age_minutes)
    if datetime.now(UTC) - user.created_at < min_age:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"New accounts can comment after {settings.comment_min_account_age_minutes} minutes. Hang tight!",
        )
    if body.parent_comment_id:
        parent = await db.get(Comment, body.parent_comment_id)
        if not parent or parent.bill_id != bill.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment you're replying to wasn't found")
        if parent.parent_comment_id is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Replies can only be one level deep")
    await enforce_hourly_limit(redis, "comment", user.id, settings.comments_per_hour)

    comment = Comment(
        user_id=user.id,
        bill_id=bill.id,
        parent_comment_id=body.parent_comment_id,
        body=body.body,
        is_flagged=await moderation.is_duplicate_spam(db, user.id, bill.id, body.body),
    )
    db.add(comment)
    interactions.record(db, user, bill, InteractionType.comment)
    await db.flush()
    await _recount(db, bill)
    await db.commit()
    await db.refresh(comment, ["user"])

    _enqueue("moderate_comment", comment.id)
    _enqueue("notify_followers_of_comment", comment.id)
    return (await comments_out(db, user, [comment]))[0]


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: uuid.UUID, db: DB, user: CurrentUser):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    bill = await db.get(Bill, comment.bill_id)
    await db.delete(comment)
    await db.flush()
    await _recount(db, bill)
    await db.commit()


@router.post("/comments/{comment_id}/vote", response_model=VoteOut)
async def vote_comment(comment_id: uuid.UUID, body: VoteIn, db: DB, redis: RedisDep, user: CurrentUser):
    comment = await db.scalar(select(Comment).where(Comment.id == comment_id).with_for_update(of=Comment))
    if not comment or comment.is_hidden:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    await enforce_hourly_limit(redis, "vote", user.id, settings.votes_per_hour)
    existing = await db.scalar(
        select(CommentVote).where(CommentVote.user_id == user.id, CommentVote.comment_id == comment.id)
    )
    old = existing.value if existing else 0
    if body.value == 0:
        if existing:
            await db.delete(existing)
    elif existing:
        existing.value = body.value
    else:
        db.add(CommentVote(user_id=user.id, comment_id=comment.id, value=body.value))
    comment.net_score += body.value - old
    await db.commit()
    return VoteOut(net_score=comment.net_score, my_vote=body.value)


@router.post("/comments/{comment_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_comment(comment_id: uuid.UUID, body: ReportIn, db: DB, user: CurrentUser):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if comment.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't report your own comment")
    db.add(CommentReport(user_id=user.id, comment_id=comment.id, category=body.category))
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return  # already reported by this user; reporting twice is a no-op
    await moderation.handle_report(db, comment)
    await db.commit()
