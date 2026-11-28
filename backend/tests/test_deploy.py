"""Settings that only matter once the API is hosted (see DEPLOY.md)."""

import tomllib
from pathlib import Path

from app.config import async_database_url

ROOT = Path(__file__).resolve().parent.parent


def test_neon_connection_strings_work_with_the_async_driver():
    neon = "postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert async_database_url(neon) == "postgresql+asyncpg://u:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb?ssl=require"
    assert async_database_url("postgres://u@h/db").startswith("postgresql+asyncpg://")
    local = "postgresql+asyncpg://localhost/politiknow"
    assert async_database_url(local) == local


def test_vercel_installs_the_same_packages_as_requirements_txt():
    listed = [line.strip() for line in (ROOT / "requirements.txt").read_text().splitlines() if line.strip()]
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert sorted(project["dependencies"]) == sorted(listed)
