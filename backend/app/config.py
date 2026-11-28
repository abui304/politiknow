from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-change-me"


def async_database_url(url: str) -> str:
    """Accepts a connection string as hosts hand it out (Neon: postgresql://...?sslmode=require&channel_binding=
    require) and returns the form the async driver needs: postgresql+asyncpg://...?ssl=require."""
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key not in ("channel_binding", "options"):
            query.append((key, value))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+asyncpg://localhost/politiknow"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    # The public website, for links in emails ("Open your recap").
    web_url: str = "http://localhost:8081"
    # This API's own public address, for links that must reach it directly (one-click unsubscribe).
    api_url: str = "http://localhost:8000"
    # inline: per-comment jobs run right after the request, and nothing else needs to run alongside the
    # API. celery: they go to a Celery worker (app/worker.py) instead.
    task_mode: Literal["inline", "celery"] = "inline"
    # Hosted on a serverless platform with a pooled Postgres (e.g. Neon's pooler): no connection pool of
    # our own, and no prepared-statement cache (pgbouncer in transaction mode can't keep them).
    serverless: bool = False

    # Auth (spec 6.1)
    jwt_secret: str = DEV_JWT_SECRET
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    bcrypt_rounds: int = 12
    google_client_ids: list[str] = []  # empty = Google sign-in disabled

    # External APIs
    congress_api_key: str = "DEMO_KEY"
    congress_number: int = 119
    openai_api_key: str = ""
    openai_model: str = "gpt-6-luna"

    # Ingestion (spec 3.3)
    ingest_times_utc: list[int] = [6, 12, 18, 23]  # hours of day, 4x daily
    ingest_lookback_days: int = 7  # first run only
    ingest_max_bills_per_run: int = 50  # caps LLM spend per run
    # Also pull in bills on this week's House and Senate floor schedule, so the calendar links into the app.
    ingest_floor_bills: bool = True
    ingest_max_members_per_run: int = 100  # legislator photo/office refreshes per run (free API calls)
    max_bill_chars_for_llm: int = 60_000

    # Feed & trending (spec 5)
    onboarding_seed_weight: int = 5  # synthetic interactions per onboarding tag
    # Spec v1.0 said 7 days; bills often sit quiet for months, so 7 days zeroed out recency for nearly everything.
    feed_recency_half_life_days: float = 30
    feed_cache_seconds: int = 300
    trending_threshold: float = 0.05
    trending_max_bills: int = 5

    # Abuse prevention (spec 7.3)
    comments_per_hour: int = 10
    votes_per_hour: int = 100
    # Linked bills fetched and summarized on demand (one OpenAI call each), per person.
    open_related_per_hour: int = 20
    comment_min_account_age_minutes: int = 60
    reports_to_hide: int = 3
    auto_hide_confidence: float = 0.95
    shadow_ban_after_hidden: int = 3

    # Notifications (spec 9.2)
    notifications_per_day: int = 5
    trending_refresh_minutes: int = 30  # recalculated in the background when the feed is read and stale

    # Weekly recap email (opt-in). Empty key = recaps are only shown in the app.
    brevo_api_key: str = ""
    email_from: str = "recap@example.com"
    email_from_name: str = "PolitiKNOW"
    email_daily_cap: int = 300  # Brevo's free plan; a run stops here and the next day's run continues

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, url: str) -> str:
        return async_database_url(url)

    @property
    def is_local(self) -> bool:
        host = urlsplit(self.database_url).hostname or ""
        return host in ("localhost", "127.0.0.1", "::1", "") or host.endswith(".local")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
