"""Database tables (spec section 4), plus the Phase 2 tables the spec implies:
comment votes, comment/summary reports, notifications, and ingestion state."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app import timeline
from app.db import Base


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuthProvider(str, enum.Enum):
    email = "email"
    google = "google"
    apple = "apple"


class InteractionType(str, enum.Enum):
    view = "view"
    vote = "vote"
    comment = "comment"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    # Null only for a social-login user who hasn't finished the mandatory display-name step.
    display_name: Mapped[str | None] = mapped_column(String(50), unique=True)
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(AuthProvider, name="auth_provider"), default=AuthProvider.email
    )
    social_provider_id: Mapped[str | None] = mapped_column(String(255))
    onboarding_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    notification_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_shadow_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    push_token: Mapped[str | None] = mapped_column(String(255))
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("auth_provider", "social_provider_id"),)


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[uuid.UUID] = uuid_pk()
    congress_number: Mapped[int] = mapped_column(Integer)
    bill_type: Mapped[str] = mapped_column(String(10))
    bill_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    summary_simple: Mapped[str | None] = mapped_column(Text)
    summary_detailed: Mapped[str | None] = mapped_column(Text)
    full_text: Mapped[str | None] = mapped_column(Text)
    primary_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    sub_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    sponsor_id: Mapped[str | None] = mapped_column(String(50), index=True)  # legislators.bioguide_id
    sponsor_name: Mapped[str | None] = mapped_column(String(255))
    sponsor_party: Mapped[str | None] = mapped_column(String(5))  # D / R / I / ID / L
    status: Mapped[str] = mapped_column(String(50), default="introduced")
    latest_action_text: Mapped[str | None] = mapped_column(Text)
    # {stage: ISO date} for each milestone reached (see app/timeline.py).
    milestones: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    congress_url: Mapped[str | None] = mapped_column(Text)
    net_score: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    # Current (not withdrawn) cosponsors, as reported by Congress.gov; the list is refetched when it changes.
    cosponsor_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_trending: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    trending_score: Mapped[float] = mapped_column(Float, default=0.0)
    # Hidden from the feed until full text exists and is summarized.
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    introduced_date: Mapped[date | None] = mapped_column(Date)
    last_action_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    ingested_at: Mapped[datetime] = created_at()
    version_hash: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (
        UniqueConstraint("congress_number", "bill_type", "bill_number"),
        Index("ix_bills_primary_tags", "primary_tags", postgresql_using="gin"),
        Index(
            "ix_bills_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    @property
    def timeline(self) -> list[dict]:
        intro = {"introduced": self.introduced_date.isoformat()} if self.introduced_date else {}
        return timeline.steps(self.bill_type, intro | (self.milestones or {}))

    @property
    def label(self) -> str:
        """Human bill number, e.g. "H.R. 1234"."""
        names = {
            "HR": "H.R.", "S": "S.", "HJRES": "H.J.Res.", "SJRES": "S.J.Res.",
            "HCONRES": "H.Con.Res.", "SCONRES": "S.Con.Res.", "HRES": "H.Res.", "SRES": "S.Res.",
        }
        return f"{names.get(self.bill_type, self.bill_type)} {self.bill_number}"


class Legislator(Base):
    """A member of Congress who sponsored or cosponsored at least one ingested bill."""

    __tablename__ = "legislators"

    bioguide_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))  # Congress.gov style: "Sen. Warren, Elizabeth [D-MA]"
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    party: Mapped[str | None] = mapped_column(String(5))
    state: Mapped[str | None] = mapped_column(String(2))
    district: Mapped[int | None] = mapped_column(Integer)
    chamber: Mapped[str | None] = mapped_column(String(10))  # house / senate
    # From Congress.gov's member record, refreshed by legislators.sync_members.
    state_name: Mapped[str | None] = mapped_column(String(50))
    image_url: Mapped[str | None] = mapped_column(Text)
    image_credit: Mapped[str | None] = mapped_column(String(255))
    # Continuous spans per chamber: [{chamber, start, end (None = still serving)}]
    career: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")
    office_address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(30))
    member_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def name(self) -> str:
        """Display name, e.g. "Elizabeth Warren"."""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.full_name


class BillCosponsor(Base):
    __tablename__ = "bill_cosponsors"

    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), primary_key=True)
    bioguide_id: Mapped[str] = mapped_column(
        ForeignKey("legislators.bioguide_id", ondelete="CASCADE"), primary_key=True, index=True
    )
    is_original: Mapped[bool] = mapped_column(Boolean, default=False)
    sponsorship_date: Mapped[date | None] = mapped_column(Date)

    legislator: Mapped[Legislator] = relationship(lazy="joined")


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    value: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (
        UniqueConstraint("user_id", "bill_id"),
        CheckConstraint("value IN (-1, 1)", name="vote_value"),
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    net_score: Mapped[int] = mapped_column(Integer, default=0)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(lazy="joined")

    __table_args__ = (CheckConstraint("char_length(body) <= 2000", name="comment_body_len"),)


class CommentVote(Base):
    __tablename__ = "comment_votes"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    comment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"))
    value: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (
        UniqueConstraint("user_id", "comment_id"),
        CheckConstraint("value IN (-1, 1)", name="comment_vote_value"),
    )


class CommentReport(Base):
    __tablename__ = "comment_reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    comment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(20))  # harassment, spam, misinformation, other
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (UniqueConstraint("user_id", "comment_id"),)


class SummaryReport(Base):
    __tablename__ = "summary_reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    feedback: Mapped[str | None] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created_at()


class Follow(Base):
    __tablename__ = "follows"

    follower_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    following_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = created_at()


class UserTagInteraction(Base):
    __tablename__ = "user_tag_interactions"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    tag_id: Mapped[str] = mapped_column(String(100))
    interaction_type: Mapped[InteractionType] = mapped_column(
        Enum(InteractionType, name="interaction_type")
    )
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (Index("ix_tag_interactions_user_time", "user_id", "created_at"),)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))  # new_bill, status_update, trending, social
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (Index("ix_notifications_user_time", "user_id", "created_at"),)


class IngestState(Base):
    __tablename__ = "ingest_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
