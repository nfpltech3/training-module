"""Add index on sso_token_log.consumed_at for cleanup queries

Revision ID: d4a5e6f7b8c9
Revises: c1f2d3e4a5b6
Create Date: 2026-03-12 11:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd4a5e6f7b8c9'
down_revision = 'c1f2d3e4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_sso_token_log_consumed_at',
        'sso_token_log',
        ['consumed_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_sso_token_log_consumed_at', table_name='sso_token_log')
