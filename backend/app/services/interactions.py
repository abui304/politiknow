from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bill, InteractionType, User, UserTagInteraction


def record(db: AsyncSession, user: User, bill: Bill, kind: InteractionType) -> None:
    """One row per primary tag; these power the 30-day tag relevance score (spec 4.1, 5.1)."""
    for tag in bill.primary_tags:
        db.add(UserTagInteraction(user_id=user.id, tag_id=tag, interaction_type=kind))
