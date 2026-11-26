from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings


class Base(DeclarativeBase):
    pass


def _engine_options() -> dict:
    """Serverless hosting (SERVERLESS=true) with a pooled Postgres: the pooler shares connections, so no
    pool of our own and no prepared-statement cache, which transaction-mode pgbouncer can't keep."""
    if settings.serverless:
        return {"poolclass": NullPool, "connect_args": {"statement_cache_size": 0, "prepared_statement_cache_size": 0}}
    return {"pool_pre_ping": True}


engine = create_async_engine(settings.database_url, **_engine_options())
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def worker_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Background jobs and CLI commands may run in a fresh event loop, so they can't share the API's pool."""
    connect_args = {"statement_cache_size": 0, "prepared_statement_cache_size": 0} if settings.serverless else {}
    return async_sessionmaker(
        create_async_engine(settings.database_url, poolclass=NullPool, connect_args=connect_args),
        expire_on_commit=False,
    )
