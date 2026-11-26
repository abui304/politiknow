"""Database tables (spec section 4), plus the Phase 2 tables the spec implies:
comment votes, comment/summary reports, notifications, and ingestion state."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
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
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
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
    # Topics are optional: this records that the topic step was finished, even with none picked.
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    notification_preferences: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_shadow_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    # Can use the moderation dashboard; granted with `cli make-moderator`.
    is_moderator: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    push_token: Mapped[str | None] = mapped_column(String(255))
    # The user's own congressional district. Private: never shown on their public profile, and found
    # from their location without storing it (see routers/places.py). District 0 = at-large/delegate.
    home_state: Mapped[str | None] = mapped_column(String(2))
    home_district: Mapped[int | None] = mapped_column(SmallInteger)
    # When the previous visit ended: what "since your last visit" compares against. Moved forward on the
    # first request of each new visit (deps.py), so it trails last_active_at by one visit.
    previous_visit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Opted in to the weekly recap email (off by default). The token signs one-click unsubscribe links.
    recap_email: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    recap_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    # The Monday of the last week whose recap was emailed: a second run that week skips this person.
    recap_sent_for: Mapped[date | None] = mapped_column(Date)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("auth_provider", "social_provider_id"),)


BILL_TYPE_NAMES = {
    "HR": "H.R.", "S": "S.", "HJRES": "H.J.Res.", "SJRES": "S.J.Res.",
    "HCONRES": "H.Con.Res.", "SCONRES": "S.Con.Res.", "HRES": "H.Res.", "SRES": "S.Res.",
}


def bill_label(bill_type: str, number: int) -> str:
    return f"{BILL_TYPE_NAMES.get(bill_type, bill_type)} {number}"


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
    # Congressional Budget Office cost estimates, as Congress.gov lists them: [{title, description, url, date}]
    cbo_estimates: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")
    # Bills Congress.gov links to this one (identical companion bills, earlier versions, procedurally related),
    # as identified by the House, Senate or CRS: [{congress, type, number, title, relationships, latest}]
    official_related: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")
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
    # Full-text search over the title (weight A), summaries (B), and full text (C). The text is capped
    # because a tsvector can't exceed 1 MB, which the longest bills (e.g. the NDAA) would.
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')"
            " || setweight(to_tsvector('english'::regconfig,"
            " coalesce(summary_simple, '') || ' ' || coalesce(summary_detailed, '')), 'B')"
            " || setweight(to_tsvector('english'::regconfig, left(coalesce(full_text, ''), 300000)), 'C')",
            persisted=True,
        ),
        deferred=True,
    )

    __table_args__ = (
        UniqueConstraint("congress_number", "bill_type", "bill_number"),
        Index("ix_bills_primary_tags", "primary_tags", postgresql_using="gin"),
        Index("ix_bills_search_vector", "search_vector", postgresql_using="gin"),
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
        return bill_label(self.bill_type, self.bill_number)


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
    # Placeholder drawn while the photo loads (services/blurhash.py); cleared when the photo changes.
    image_blurhash: Mapped[str | None] = mapped_column(String(64))
    # Continuous spans per chamber: [{chamber, start, end (None = still serving)}]
    career: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]")
    office_address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(30))
    member_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # Serving now, per Congress.gov's current-member roster (legislators.sync_roster).
    in_office: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
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
    # Last moderator decision. Only reports filed after it count toward auto-hiding or re-queue the comment.
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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


class BillFollow(Base):
    """Alerts when the bill moves, without voting or commenting on it."""

    __tablename__ = "bill_follows"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bills.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = created_at()


class LegislatorFollow(Base):
    """Alerts when the member sponsors or cosponsors a bill, and their bills ranked up in the feed."""

    __tablename__ = "legislator_follows"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    bioguide_id: Mapped[str] = mapped_column(
        ForeignKey("legislators.bioguide_id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = created_at()


class DistrictFollow(Base):
    """A district the user is interested in (where they grew up, a swing seat...), highlighted on their map."""

    __tablename__ = "district_follows"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    state: Mapped[str] = mapped_column(String(2), primary_key=True)
    district: Mapped[int] = mapped_column(SmallInteger, primary_key=True)  # 0 = at-large/delegate
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
    type: Mapped[str] = mapped_column(String(20))  # new_bill, status_update, trending, social, legislator
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    # When it was opened, and from where (in_app, push, email): for alert open-to-visit rates.
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    channel: Mapped[str | None] = mapped_column(String(10))
    # Earlier activity filled in when a bill is first followed, so Alerts isn't empty on day one.
    # Never pushed, and doesn't count against the daily cap.
    backfill: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (Index("ix_notifications_user_time", "user_id", "created_at"),)


class ActivityDay(Base):
    """One row per user per day they used the app: the basis for weekly and cohort retention.
    Day precision only; nothing about what they looked at."""

    __tablename__ = "activity_days"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True, index=True)
    platform: Mapped[str | None] = mapped_column(String(10))


# The only events recorded. No free text, no search terms, no IP or browser details.
EVENT_NAMES = (
    "recap_open",
    "since_item_open",
    "floor_week_open",
    "glossary_tap",
    "share",
    "contact_member",
)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(30))
    ref_id: Mapped[str | None] = mapped_column(String(64))


class RollCall(Base):
    """A recorded vote in the House or Senate (Congress.gov house-vote API; senate.gov roll-call XML)."""

    __tablename__ = "roll_calls"

    id: Mapped[uuid.UUID] = uuid_pk()
    chamber: Mapped[str] = mapped_column(String(10))  # house / senate
    congress: Mapped[int] = mapped_column(Integer)
    session: Mapped[int] = mapped_column(SmallInteger)
    number: Mapped[int] = mapped_column(Integer)
    voted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # The official question, word for word ("On Passage", "On the Cloture Motion"). Never rewritten.
    question: Mapped[str] = mapped_column(Text)
    # passage / cloture / amendment / procedural / nomination / other (votes.classify)
    kind: Mapped[str] = mapped_column(String(15))
    result: Mapped[str] = mapped_column(String(100))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="SET NULL"), index=True)
    # The measure as the source names it ("H.R. 1148", "PN 123"), kept even when no bill row matches.
    measure: Mapped[str | None] = mapped_column(String(50))
    yea: Mapped[int] = mapped_column(Integer, default=0)
    nay: Mapped[int] = mapped_column(Integer, default=0)
    present: Mapped[int] = mapped_column(Integer, default=0)
    not_voting: Mapped[int] = mapped_column(Integer, default=0)
    # {"D": {"yea": 210, "nay": 2, ...}, "R": {...}, "I": {...}}
    party_totals: Mapped[dict] = mapped_column(JSONB, default=dict)
    source_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (UniqueConstraint("chamber", "congress", "session", "number"),)


class MemberVote(Base):
    __tablename__ = "member_votes"

    roll_call_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roll_calls.id", ondelete="CASCADE"), primary_key=True
    )
    bioguide_id: Mapped[str] = mapped_column(String(20), primary_key=True, index=True)
    # Yea / Nay / Present / Not Voting (Aye and No are stored as Yea and Nay)
    position: Mapped[str] = mapped_column(String(12))

    roll_call: Mapped[RollCall] = relationship()


class IngestState(Base):
    __tablename__ = "ingest_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
