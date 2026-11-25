"""Persist parallel benchmark options, counters, and per-agent model-call attribution."""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("missions", sa.Column("parallel_state", postgresql.JSONB(), nullable=True))
    op.add_column("llm_calls", sa.Column("agent_id", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("llm_calls", "agent_id")
    op.drop_column("missions", "parallel_state")
