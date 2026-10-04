from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def worker_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Celery tasks run each job in a fresh event loop, so they can't share a pool."""
    return async_sessionmaker(
        create_async_engine(settings.database_url, poolclass=NullPool), expire_on_commit=False
    )
