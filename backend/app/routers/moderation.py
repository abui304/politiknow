"""Moderator dashboard: the comment review queue, shadow bans, and reports on AI summaries."""

import uuid
from collections import Counter, defaultdict
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_, exists, func, or_, select

from app.deps import DB, Moderator
from app.models import Bill, Comment, CommentReport, SummaryReport, User, bill_label
from app.schemas import ModCommentOut, ModUserOut, SummaryReportGroup, SummaryReportOut
from app.services import llm, moderation

router = APIRouter(prefix="/moderation", tags=["moderation"])

# Reports filed since the comment was last reviewed (all of them, if it never was).
_open_report = or_(Comment.reviewed_at.is_(None), CommentReport.created_at > Comment.reviewed_at)


async def _comments_out(db, comments: list[Comment]) -> list[ModCommentOut]:
    ids = [c.id for c in comments]
    categories: dict[uuid.UUID, Counter] = defaultdict(Counter)
    for comment_id, category, n in await db.execute(
        select(CommentReport.comment_id, CommentReport.category, func.count())
        .where(CommentReport.comment_id.in_(ids)).group_by(CommentReport.comment_id, CommentReport.category)
    ):
        categories[comment_id][category] = n
    open_reports = dict((await db.execute(
        select(CommentReport.comment_id, func.count()).join(Comment, Comment.id == CommentReport.comment_id)
        .where(CommentReport.comment_id.in_(ids), _open_report).group_by(CommentReport.comment_id)
    )).all())
    author_ids = {c.user_id for c in comments}
    hidden = dict((await db.execute(
        select(Comment.user_id, func.count())
        .where(Comment.user_id.in_(author_ids), Comment.is_hidden.is_(True)).group_by(Comment.user_id)
    )).all())
    bill_rows = await db.execute(
        select(Bill.id, Bill.bill_type, Bill.bill_number, Bill.title).where(Bill.id.in_({c.bill_id for c in comments}))
    )
    bills = {row.id: row for row in bill_rows}
    return [
        ModCommentOut(
            id=c.id,
            bill_id=c.bill_id,
            bill_label=bill_label(bills[c.bill_id].bill_type, bills[c.bill_id].bill_number),
            bill_title=bills[c.bill_id].title,
            parent_comment_id=c.parent_comment_id,
            author_id=c.user_id,
            author_name=c.user.display_name or "anonymous",
            author_shadow_banned=c.user.is_shadow_banned,
            author_hidden_count=hidden.get(c.user_id, 0),
            body=c.body,
            net_score=c.net_score,
            is_flagged=c.is_flagged,
            is_hidden=c.is_hidden,
            reviewed_at=c.reviewed_at,
            report_count=open_reports.get(c.id, 0),
            report_categories=dict(categories[c.id]),
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.get("/comments", response_model=list[ModCommentOut])
async def comment_queue(
    db: DB, _: Moderator, view: Literal["pending", "hidden"] = "pending", limit: int = Query(50, le=100)
):
    """`pending`: flagged by the AI or duplicate check, or reported, and not reviewed since.
    `hidden`: every hidden comment, so a moderator can restore one."""
    if view == "pending":
        reported = exists().where(CommentReport.comment_id == Comment.id, _open_report)
        where = or_(reported, and_(Comment.is_flagged.is_(True), Comment.reviewed_at.is_(None)))
    else:
        where = Comment.is_hidden.is_(True)
    comments = list(await db.scalars(select(Comment).where(where).order_by(Comment.created_at.desc()).limit(limit)))
    return await _comments_out(db, comments)


async def _comment(db, comment_id: uuid.UUID) -> Comment:
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return comment


@router.post("/comments/{comment_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_comment(comment_id: uuid.UUID, db: DB, _: Moderator):
    await moderation.approve(db, await _comment(db, comment_id))
    await db.commit()


@router.post("/comments/{comment_id}/hide", status_code=status.HTTP_204_NO_CONTENT)
async def hide_comment(comment_id: uuid.UUID, db: DB, _: Moderator):
    await moderation.remove(db, await _comment(db, comment_id))
    await db.commit()


@router.get("/users", response_model=list[ModUserOut])
async def list_users(db: DB, _: Moderator, q: str = "", limit: int = Query(50, le=100)):
    """Shadow-banned users, or anyone whose display name starts with `q`."""
    where = User.display_name.istartswith(q, autoescape=True) if q else User.is_shadow_banned.is_(True)
    users = list(await db.scalars(
        select(User).where(where, User.display_name.is_not(None)).order_by(User.display_name).limit(limit)
    ))
    ids = [u.id for u in users]
    counts = {
        row.user_id: row for row in await db.execute(
            select(
                Comment.user_id,
                func.count().label("total"),
                func.count().filter(Comment.is_hidden.is_(True)).label("hidden"),
            ).where(Comment.user_id.in_(ids)).group_by(Comment.user_id)
        )
    }
    reports = dict((await db.execute(
        select(Comment.user_id, func.count()).join(CommentReport, CommentReport.comment_id == Comment.id)
        .where(Comment.user_id.in_(ids)).group_by(Comment.user_id)
    )).all())
    return [
        ModUserOut(
            id=u.id,
            display_name=u.display_name,
            is_shadow_banned=u.is_shadow_banned,
            comment_count=counts[u.id].total if u.id in counts else 0,
            hidden_count=counts[u.id].hidden if u.id in counts else 0,
            report_count=reports.get(u.id, 0),
            created_at=u.created_at,
        )
        for u in users
    ]


async def _set_ban(db, me: User, user_id: uuid.UUID, banned: bool) -> None:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't shadow-ban yourself")
    await moderation.set_shadow_ban(db, user, banned)
    await db.commit()


@router.put("/users/{user_id}/shadow-ban", status_code=status.HTTP_204_NO_CONTENT)
async def shadow_ban(user_id: uuid.UUID, db: DB, me: Moderator):
    await _set_ban(db, me, user_id, True)


@router.delete("/users/{user_id}/shadow-ban", status_code=status.HTTP_204_NO_CONTENT)
async def lift_shadow_ban(user_id: uuid.UUID, db: DB, me: Moderator):
    await _set_ban(db, me, user_id, False)


@router.get("/summary-reports", response_model=list[SummaryReportGroup])
async def summary_reports(db: DB, _: Moderator):
    """Unresolved reports on AI summaries, grouped by bill, most recently reported first."""
    rows = await db.execute(
        select(SummaryReport, User.display_name, Bill.id, Bill.bill_type, Bill.bill_number, Bill.title,
               Bill.summary_simple, Bill.summary_detailed)
        .join(User, User.id == SummaryReport.user_id).join(Bill, Bill.id == SummaryReport.bill_id)
        .where(SummaryReport.resolved.is_(False)).order_by(SummaryReport.created_at.desc()).limit(500)
    )
    groups: dict[uuid.UUID, SummaryReportGroup] = {}
    for report, reporter, bill_id, bill_type, number, title, simple, detailed in rows:
        group = groups.get(bill_id) or groups.setdefault(bill_id, SummaryReportGroup(
            bill_id=bill_id, bill_label=bill_label(bill_type, number), bill_title=title,
            summary_simple=simple, summary_detailed=detailed, reports=[],
        ))
        group.reports.append(SummaryReportOut(
            id=report.id, reporter_name=reporter or "anonymous", feedback=report.feedback, created_at=report.created_at
        ))
    return list(groups.values())


async def _resolve(db, bill_id: uuid.UUID) -> None:
    for report in await db.scalars(
        select(SummaryReport).where(SummaryReport.bill_id == bill_id, SummaryReport.resolved.is_(False))
    ):
        report.resolved = True


@router.post("/bills/{bill_id}/summary-reports/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_summary_reports(bill_id: uuid.UUID, db: DB, _: Moderator):
    await _resolve(db, bill_id)
    await db.commit()


@router.post("/bills/{bill_id}/regenerate-summary", response_model=SummaryReportGroup)
async def regenerate_summary(bill_id: uuid.UUID, db: DB, _: Moderator):
    """Re-runs the AI summary (two OpenAI calls) and resolves the bill's open reports."""
    bill = await db.get(Bill, bill_id)
    if not bill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
    if not llm.enabled():
        raise HTTPException(status.HTTP_409_CONFLICT, "AI summaries are off because no OpenAI key is set")
    if not bill.full_text:
        raise HTTPException(status.HTTP_409_CONFLICT, "This bill has no text to summarize yet")
    bill.summary_simple, bill.summary_detailed = await llm.summarize(bill.title, bill.full_text)
    await _resolve(db, bill.id)
    await db.commit()
    return SummaryReportGroup(
        bill_id=bill.id, bill_label=bill.label, bill_title=bill.title,
        summary_simple=bill.summary_simple, summary_detailed=bill.summary_detailed, reports=[],
    )
