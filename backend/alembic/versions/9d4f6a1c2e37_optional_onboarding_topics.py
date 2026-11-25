"""optional onboarding topics

Revision ID: 9d4f6a1c2e37
Revises: 7c1e2d9a4b50
Create Date: 2026-11-25 01:30:00.000000

Topics became optional, so "finished onboarding" can't be inferred from having topics any more.
Everyone who already picked topics counts as onboarded.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '9d4f6a1c2e37'
down_revision: str | Sequence[str] | None = '7c1e2d9a4b50'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('onboarded', sa.Boolean(), server_default='false', nullable=False))
    op.execute("UPDATE users SET onboarded = true WHERE jsonb_array_length(coalesce(onboarding_tags, '[]'::jsonb)) > 0")


def downgrade() -> None:
    op.drop_column('users', 'onboarded')
