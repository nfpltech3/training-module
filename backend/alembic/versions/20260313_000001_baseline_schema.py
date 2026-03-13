"""baseline_schema

Revision ID: 20260313_000001
Revises:
Create Date: 2026-03-13 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260313_000001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE moduletypeenum AS ENUM ('DEPARTMENT_TRAINING', 'CLIENT_TRAINING', 'ON_BOARDING');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE contenttypeenum AS ENUM ('VIDEO', 'DOCUMENT');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)

    op.create_table(
        "departments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("os_department_id", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_departments_os_department_id", "departments", ["os_department_id"], unique=True)
    op.create_index("ix_departments_slug", "departments", ["slug"], unique=True)

    op.create_table(
        "roles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    op.create_table(
        "modules",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("module_type", sa.Text(), nullable=True),
        sa.Column("sequence_index", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("ALTER TABLE modules ALTER COLUMN module_type TYPE moduletypeenum USING module_type::moduletypeenum")

    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("os_user_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("department_slug", sa.String(), nullable=True),
        sa.Column("org_id", sa.String(), nullable=True),
        sa.Column("is_app_admin", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_os_user_id", "users", ["os_user_id"], unique=True)

    op.create_table(
        "module_roles",
        sa.Column("module_id", sa.String(), nullable=False),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("module_id", "role_id"),
    )

    op.create_table(
        "module_departments",
        sa.Column("module_id", sa.String(), nullable=False),
        sa.Column("department_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("module_id", "department_id"),
    )

    op.create_table(
        "module_client_orgs",
        sa.Column("module_id", sa.String(), nullable=False),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("module_id", "org_id"),
    )

    op.create_table(
        "content",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("embed_url", sa.String(), nullable=True),
        sa.Column("document_url", sa.String(), nullable=True),
        sa.Column("module_id", sa.String(), nullable=False),
        sa.Column("sequence_index", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_duration", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("ALTER TABLE content ALTER COLUMN content_type TYPE contenttypeenum USING content_type::contenttypeenum")

    op.create_table(
        "user_progress",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("content_id", sa.String(), nullable=False),
        sa.Column("furthest_second_watched", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("is_completed", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_accessed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["content_id"], ["content.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "content_id", name="uq_user_progress_user_content"),
    )

    op.create_table(
        "sso_token_log",
        sa.Column("token_id", sa.String(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("app_slug", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("token_id"),
    )
    op.create_index("ix_sso_token_log_consumed_at", "sso_token_log", ["consumed_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sso_token_log_consumed_at", table_name="sso_token_log")
    op.drop_table("sso_token_log")
    op.drop_table("user_progress")
    op.drop_table("content")
    op.drop_table("module_client_orgs")
    op.drop_table("module_departments")
    op.drop_table("module_roles")
    op.drop_index("ix_users_os_user_id", table_name="users")
    op.drop_table("users")
    op.drop_table("modules")
    op.drop_index("ix_roles_name", table_name="roles")
    op.drop_table("roles")
    op.drop_index("ix_departments_slug", table_name="departments")
    op.drop_index("ix_departments_os_department_id", table_name="departments")
    op.drop_table("departments")

    content_type_enum = sa.Enum("VIDEO", "DOCUMENT", name="contenttypeenum")
    module_type_enum = sa.Enum(
        "DEPARTMENT_TRAINING",
        "CLIENT_TRAINING",
        "ON_BOARDING",
        name="moduletypeenum",
    )
    content_type_enum.drop(op.get_bind(), checkfirst=True)
    module_type_enum.drop(op.get_bind(), checkfirst=True)
