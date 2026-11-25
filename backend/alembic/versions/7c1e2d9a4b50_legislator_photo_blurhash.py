"""legislator photo blurhash

Revision ID: 7c1e2d9a4b50
Revises: 151e5f28f852
Create Date: 2026-11-25 00:00:00.000000

Existing photos get their placeholder from `python -m app.cli backfill-blurhash` (or the next ingestion runs).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '7c1e2d9a4b50'
down_revision: str | Sequence[str] | None = '151e5f28f852'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('legislators', sa.Column('image_blurhash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('legislators', 'image_blurhash')
