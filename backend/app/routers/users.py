import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select

from app.deps import DB, CurrentUser, IncompleteUser
from app.models import Bill, Comment, Follow, User
from app.routers.auth import display_name_taken
from app.schemas import CommentWithBill, MeOut, MeUpdate, NotificationPrefs, ProfileOut
from app.serializers import comments_out, visible_comments

router = APIRouter(prefix="/users", tags=["users"])


async def _follow_counts(db, user_id: uuid.UUID) -> tuple[int, int]:
    followers = await db.scalar(select(func.count()).where(Follow.following_id == user_id))
    following = await db.scalar(select(func.count()).where(Follow.follower_id == user_id))
    return followers or 0, following or 0


async def _me(db, user: User) -> MeOut:
    followers, following = await _follow_counts(db, user.id)
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        auth_provider=user.auth_provider.value,
        onboarding_tags=user.onboarding_tags or [],
        notification_preferences=NotificationPrefs.model_validate(user.notification_preferences or {}),
        is_premium=user.is_premium,
        email_verified=user.email_verified,
        follower_count=followers,
        following_count=following,
        created_at=user.created_at,
    )


@router.get("/me", response_model=MeOut)
async def get_me(db: DB, user: IncompleteUser):
    return await _me(db, user)


@router.patch("/me", response_model=MeOut)
async def update_me(body: MeUpdate, db: DB, user: IncompleteUser):
    fields = body.model_fields_set
    if "display_name" in fields and body.display_name and body.display_name != user.display_name:
        if await display_name_taken(db, body.display_name):
            raise HTTPException(status.HTTP_409_CONFLICT, "That display name is taken")
        user.display_name = body.display_name
    if "onboarding_tags" in fields and body.onboarding_tags is not None:
        user.onboarding_tags = body.onboarding_tags
    if "notification_preferences" in fields and body.notification_preferences:
        user.notification_preferences = body.notification_preferences.model_dump(mode="json")
    if "push_token" in fields:
        user.push_token = body.push_token
    await db.commit()
    return await _me(db, user)


async def _get_user(db, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if not user or not user.display_name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/{user_id}", response_model=ProfileOut)
async def get_profile(user_id: uuid.UUID, db: DB, me: CurrentUser):
    user = await _get_user(db, user_id)
    followers, following = await _follow_counts(db, user.id)
    is_following = bool(await db.get(Follow, (me.id, user.id)))
    return ProfileOut(
        id=user.id,
        display_name=user.display_name,
        follower_count=followers,
        following_count=following,
        is_following=is_following,
        is_me=user.id == me.id,
        created_at=user.created_at,
    )


@router.post("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow(user_id: uuid.UUID, db: DB, me: CurrentUser):
    if user_id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't follow yourself")
    await _get_user(db, user_id)
    if not await db.get(Follow, (me.id, user_id)):
        db.add(Follow(follower_id=me.id, following_id=user_id))
        await db.commit()


@router.delete("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow(user_id: uuid.UUID, db: DB, me: CurrentUser):
    await db.execute(delete(Follow).where(Follow.follower_id == me.id, Follow.following_id == user_id))
    await db.commit()


@router.get("/{user_id}/comments", response_model=list[CommentWithBill])
async def comment_history(user_id: uuid.UUID, db: DB, me: CurrentUser, limit: int = 50):
    await _get_user(db, user_id)
    rows = (await db.execute(
        select(Comment, Bill)
        .join(Bill, Bill.id == Comment.bill_id)
        .where(Comment.user_id == user_id, visible_comments(me))
        .order_by(Comment.created_at.desc())
        .limit(min(limit, 100))
    )).all()
    outs = await comments_out(db, me, [c for c, _ in rows])
    return [
        CommentWithBill(**o.model_dump(), bill_label=b.label, bill_title=b.title)
        for o, (_, b) in zip(outs, rows, strict=True)
    ]
