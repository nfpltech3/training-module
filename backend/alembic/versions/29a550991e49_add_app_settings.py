"""add_app_settings

Revision ID: 29a550991e49
Revises: 9bd3b4c587c4
Create Date: 2026-04-18 11:19:45.970434

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '29a550991e49'
down_revision: Union[str, Sequence[str], None] = '9bd3b4c587c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('app_settings',
        sa.Column('setting_key', sa.String(), nullable=False),
        sa.Column('setting_value', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('setting_key')
    )
    op.execute(
        "INSERT INTO app_settings (setting_key, setting_value, updated_at) "
        "VALUES ('video_max_duration_seconds', '1800', CURRENT_TIMESTAMP)"
    )


def downgrade() -> None:
    op.drop_table('app_settings')
