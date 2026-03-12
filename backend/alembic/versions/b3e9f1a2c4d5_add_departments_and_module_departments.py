"""add_departments_and_module_departments

Revision ID: b3e9f1a2c4d5
Revises: 421c42fae78b
Create Date: 2026-03-11 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3e9f1a2c4d5'
down_revision: Union[str, Sequence[str], None] = '421c42fae78b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create departments table (local cache of OS departments)
    op.create_table(
        'departments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('os_department_id', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('os_department_id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('ix_departments_os_department_id', 'departments', ['os_department_id'])
    op.create_index('ix_departments_slug', 'departments', ['slug'])

    # 2. Create module_departments FK table (replaces module_department_slugs)
    op.create_table(
        'module_departments',
        sa.Column('module_id', sa.String(), nullable=False),
        sa.Column('department_id', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['module_id'], ['modules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('module_id', 'department_id'),
    )

    # 3. Migrate existing slug data — join through departments.slug (best-effort;
    #    rows with no matching department are silently dropped).
    op.execute("""
        INSERT INTO module_departments (module_id, department_id)
        SELECT mds.module_id, d.id
        FROM module_department_slugs mds
        JOIN departments d ON d.slug = mds.department_slug
        WHERE d.status = 'active'
    """)

    # 4. Drop the old slug-based table
    op.drop_table('module_department_slugs')


def downgrade() -> None:
    # Recreate slug-based table
    op.create_table(
        'module_department_slugs',
        sa.Column('module_id', sa.String(), nullable=False),
        sa.Column('department_slug', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['module_id'], ['modules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('module_id', 'department_slug'),
    )

    # Best-effort reverse migration: recover slugs through departments table
    op.execute("""
        INSERT INTO module_department_slugs (module_id, department_slug)
        SELECT md.module_id, d.slug
        FROM module_departments md
        JOIN departments d ON d.id = md.department_id
    """)

    op.drop_table('module_departments')
    op.drop_index('ix_departments_slug', table_name='departments')
    op.drop_index('ix_departments_os_department_id', table_name='departments')
    op.drop_table('departments')
