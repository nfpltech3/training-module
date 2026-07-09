"""add content scheduling columns

Revision ID: a26acd46b629
Revises: 0d9a72b0217f
Create Date: 2026-07-07 17:22:51.355648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a26acd46b629'
down_revision: Union[str, Sequence[str], None] = '0d9a72b0217f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('content', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(), server_default='published', nullable=False))
        batch_op.add_column(sa.Column('scheduled_publish_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('published_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('sheet_row_hash', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('content', schema=None) as batch_op:
        batch_op.drop_column('sheet_row_hash')
        batch_op.drop_column('published_at')
        batch_op.drop_column('scheduled_publish_at')
        batch_op.drop_column('status')
