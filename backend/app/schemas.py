import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.taxonomy import is_valid_tag

NAME_RULES = dict(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]+$")


def _check_tags(tags: list[str]) -> list[str]:
    bad = [t for t in tags if not is_valid_tag(t)]
    if bad:
        raise ValueError(f"Unknown tags: {', '.join(bad)}")
    return list(dict.fromkeys(tags))


# ---------- auth ----------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(**NAME_RULES)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    id_token: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    needs_display_name: bool
    needs_onboarding: bool


# ---------- users ----------

class QuietHours(BaseModel):
    start: str = Field(pattern=r"^\d{2}:\d{2}$")  # "22:00"
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    tz: str = "America/New_York"


class NotificationPrefs(BaseModel):
    types: dict[Literal["new_bill", "status_update", "trending", "social"], bool] = {
        "new_bill": True, "status_update": True, "trending": True, "social": True,
    }
    tags: list[str] | None = None  # None = use the user's tag preferences
    quiet_hours: QuietHours | None = None

    @field_validator("tags")
    @classmethod
    def tags_ok(cls, v: list[str] | None) -> list[str] | None:
        return _check_tags(v) if v is not None else v


class MeOut(BaseModel):
    id: uuid.UUID
    email: str | None
    display_name: str | None
    auth_provider: str
    onboarding_tags: list[str]
    notification_preferences: NotificationPrefs
    is_premium: bool
    email_verified: bool
    follower_count: int
    following_count: int
    created_at: datetime


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, **NAME_RULES)
    onboarding_tags: list[str] | None = None
    notification_preferences: NotificationPrefs | None = None
    push_token: str | None = Field(default=None, max_length=255)

    @field_validator("onboarding_tags")
    @classmethod
    def tags_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        v = _check_tags(v)
        if not 5 <= len(v) <= 10:
            raise ValueError("Pick between 5 and 10 topics")
        return v


class ProfileOut(BaseModel):
    id: uuid.UUID
    display_name: str
    follower_count: int
    following_count: int
    is_following: bool
    is_me: bool
    created_at: datetime


# ---------- bills ----------

class TimelineStep(BaseModel):
    stage: str
    label: str  # "Passed House"
    short: str  # "House"
    date: date | None
    reached: bool


class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    congress_number: int
    bill_type: str
    bill_number: int
    title: str
    summary_simple: str | None
    summary_detailed: str | None
    primary_tags: list[str]
    sub_tags: list[str]
    sponsor_id: str | None
    sponsor_name: str | None  # Congress.gov's form: "Rep. Schrier, Kim [D-WA-8]"
    sponsor_label: str | None = None  # display form: "Kim Schrier (D-WA-8)"
    sponsor_party: str | None
    cosponsor_count: int
    status: str
    latest_action_text: str | None
    timeline: list[TimelineStep]
    congress_url: str | None
    net_score: int
    comment_count: int
    is_trending: bool
    introduced_date: date | None
    last_action_date: datetime | None
    my_vote: int = 0


class BillPage(BaseModel):
    items: list[BillOut]
    next_cursor: int | None


class BillText(BaseModel):
    full_text: str | None
    congress_url: str | None


class VoteIn(BaseModel):
    value: Literal[-1, 0, 1]  # 0 clears the vote


class VoteOut(BaseModel):
    net_score: int
    my_vote: int


class SummaryReportIn(BaseModel):
    feedback: str | None = Field(default=None, max_length=2000)


# ---------- legislators ----------

class LegislatorBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bioguide_id: str
    name: str
    full_name: str
    party: str | None
    state: str | None
    district: int | None
    chamber: str | None
    image_url: str | None


class CareerSpan(BaseModel):
    chamber: Literal["house", "senate"]
    start: int | None
    end: int | None  # None = still serving


class LegislatorOut(LegislatorBase):
    state_name: str | None
    image_credit: str | None
    career: list[CareerSpan]
    office_address: str | None
    phone: str | None
    sponsored_count: int  # published bills only
    cosponsored_count: int


class CosponsorOut(LegislatorBase):
    is_original: bool
    sponsorship_date: date | None


# ---------- comments ----------

class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    parent_comment_id: uuid.UUID | None = None

    @field_validator("body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment can't be empty")
        return v.strip()


class CommentOut(BaseModel):
    id: uuid.UUID
    bill_id: uuid.UUID
    parent_comment_id: uuid.UUID | None
    author_id: uuid.UUID
    author_name: str
    body: str
    net_score: int
    my_vote: int
    is_mine: bool
    is_flagged: bool
    is_hidden: bool
    created_at: datetime
    replies: list["CommentOut"] = []


class CommentWithBill(CommentOut):
    bill_label: str
    bill_title: str


class ReportIn(BaseModel):
    category: Literal["harassment", "spam", "misinformation", "other"]


# ---------- notifications / misc ----------

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    bill_id: uuid.UUID | None
    is_read: bool
    created_at: datetime


class TagOut(BaseModel):
    name: str


class HashtagOut(BaseModel):
    name: str
    bill_count: int


class StageOut(BaseModel):
    key: str  # a /search?stage= value
    bill_count: int
