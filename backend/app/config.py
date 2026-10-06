from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+asyncpg://localhost/politiknow"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]

    # Auth (spec 6.1)
    jwt_secret: str = "dev-only-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    bcrypt_rounds: int = 12
    google_client_ids: list[str] = []  # empty = Google sign-in disabled

    # External APIs
    congress_api_key: str = "DEMO_KEY"
    congress_number: int = 119
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Ingestion (spec 3.3)
    ingest_times_utc: list[int] = [6, 12, 18, 23]  # hours of day, 4x daily
    ingest_lookback_days: int = 7  # first run only
    ingest_max_bills_per_run: int = 50  # caps LLM spend per run
    ingest_max_members_per_run: int = 100  # legislator photo/office refreshes per run (free API calls)
    max_bill_chars_for_llm: int = 60_000

    # Feed & trending (spec 5)
    onboarding_seed_weight: int = 5  # synthetic interactions per onboarding tag
    # Spec v1.0 said 7 days; bills often sit quiet for months, so 7 days zeroed out recency for nearly everything.
    feed_recency_half_life_days: float = 30
    feed_cache_seconds: int = 300
    trending_threshold: float = 0.05

    # Abuse prevention (spec 7.3)
    comments_per_hour: int = 10
    votes_per_hour: int = 100
    comment_min_account_age_minutes: int = 60
    reports_to_hide: int = 3
    auto_hide_confidence: float = 0.95
    shadow_ban_after_hidden: int = 3

    # Notifications (spec 9.2)
    notifications_per_day: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
