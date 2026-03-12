"""user_status_and_integrity_constraints

Revision ID: c1f2d3e4a5b6
Revises: b3e9f1a2c4d5
Create Date: 2026-03-11 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1f2d3e4a5b6"
down_revision: Union[str, Sequence[str], None] = "b3e9f1a2c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(bind)
    return any(c["name"] == column_name for c in inspector.get_columns(table_name))


def _assert_no_duplicate_emails(bind) -> None:
    dupes = bind.execute(
        sa.text(
            """
            SELECT email, COUNT(*) AS cnt
            FROM users
            GROUP BY email
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()
    if dupes:
        preview = ", ".join(f"{row[0]} ({row[1]})" for row in dupes[:10])
        raise RuntimeError(
            "Cannot add uq_users_email: duplicate emails exist in users table. "
            f"Resolve duplicates first. Examples: {preview}"
        )


def _dedupe_user_progress_rows(bind) -> None:
    dupes = bind.execute(
        sa.text(
            """
            SELECT user_id, content_id, COUNT(*) AS cnt
            FROM user_progress
            GROUP BY user_id, content_id
            HAVING COUNT(*) > 1
            """
        )
    ).mappings().all()

    for dup in dupes:
        rows = bind.execute(
            sa.text(
                """
                SELECT id, furthest_second_watched, is_completed, completed_at, last_accessed_at
                FROM user_progress
                WHERE user_id = :user_id AND content_id = :content_id
                ORDER BY
                    CASE WHEN is_completed THEN 1 ELSE 0 END DESC,
                    COALESCE(furthest_second_watched, 0) DESC,
                    CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END,
                    completed_at DESC,
                    CASE WHEN last_accessed_at IS NULL THEN 1 ELSE 0 END,
                    last_accessed_at DESC,
                    id ASC
                """
            ),
            {"user_id": dup["user_id"], "content_id": dup["content_id"]},
        ).mappings().all()

        keeper_id = rows[0]["id"]
        furthest_second_watched = max((r["furthest_second_watched"] or 0) for r in rows)
        is_completed = any(bool(r["is_completed"]) for r in rows)
        completed_times = [r["completed_at"] for r in rows if r["completed_at"] is not None]
        completed_at = min(completed_times) if completed_times else None
        accessed_times = [r["last_accessed_at"] for r in rows if r["last_accessed_at"] is not None]
        last_accessed_at = max(accessed_times) if accessed_times else None

        bind.execute(
            sa.text(
                """
                UPDATE user_progress
                SET furthest_second_watched = :furthest_second_watched,
                    is_completed = :is_completed,
                    completed_at = :completed_at,
                    last_accessed_at = :last_accessed_at
                WHERE id = :keeper_id
                """
            ),
            {
                "furthest_second_watched": furthest_second_watched,
                "is_completed": 1 if is_completed else 0,
                "completed_at": completed_at,
                "last_accessed_at": last_accessed_at,
                "keeper_id": keeper_id,
            },
        )

        bind.execute(
            sa.text(
                """
                DELETE FROM user_progress
                WHERE user_id = :user_id
                  AND content_id = :content_id
                  AND id <> :keeper_id
                """
            ),
            {
                "user_id": dup["user_id"],
                "content_id": dup["content_id"],
                "keeper_id": keeper_id,
            },
        )


def _upgrade_sqlite(bind) -> None:
    # Rebuild content to enforce ON DELETE CASCADE for module_id FK.
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute(
        """
        CREATE TABLE content_new (
            id VARCHAR NOT NULL PRIMARY KEY,
            title VARCHAR NOT NULL,
            description TEXT,
            content_type VARCHAR NOT NULL,
            embed_url VARCHAR,
            document_url VARCHAR,
            module_id VARCHAR NOT NULL,
            sequence_index INTEGER DEFAULT 0,
            total_duration INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME,
            FOREIGN KEY(module_id) REFERENCES modules (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        INSERT INTO content_new (
            id, title, description, content_type, embed_url, document_url,
            module_id, sequence_index, total_duration, is_active, created_at
        )
        SELECT
            id, title, description, content_type, embed_url, document_url,
            module_id, sequence_index, total_duration, is_active, created_at
        FROM content
        """
    )
    op.drop_table("content")
    op.rename_table("content_new", "content")

    # Rebuild users to enforce unique email + role FK RESTRICT and keep legacy is_active column.
    op.execute(
        """
        CREATE TABLE users_new (
            id VARCHAR NOT NULL PRIMARY KEY,
            os_user_id VARCHAR NOT NULL UNIQUE,
            email VARCHAR NOT NULL,
            full_name VARCHAR NOT NULL,
            department_slug VARCHAR,
            org_id VARCHAR,
            is_app_admin BOOLEAN DEFAULT 0,
            role_id VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME,
            status VARCHAR NOT NULL DEFAULT 'active',
            CONSTRAINT uq_users_email UNIQUE (email),
            FOREIGN KEY(role_id) REFERENCES roles (id) ON DELETE RESTRICT
        )
        """
    )
    op.execute(
        """
        INSERT INTO users_new (
            id, os_user_id, email, full_name, department_slug, org_id,
            is_app_admin, role_id, is_active, created_at, status
        )
        SELECT
            id, os_user_id, email, full_name, department_slug, org_id,
            is_app_admin, role_id, is_active, created_at,
            COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'disabled' END, 'active')
        FROM users
        """
    )
    op.drop_table("users")
    op.rename_table("users_new", "users")
    op.create_index("ix_users_os_user_id", "users", ["os_user_id"], unique=True)

    # Rebuild user_progress with DB-level uniqueness and deduping.
    op.execute(
        """
        CREATE TABLE user_progress_new (
            id VARCHAR NOT NULL PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            content_id VARCHAR NOT NULL,
            furthest_second_watched INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT 0,
            completed_at DATETIME,
            last_accessed_at DATETIME,
            CONSTRAINT uq_user_progress_user_content UNIQUE (user_id, content_id),
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        INSERT INTO user_progress_new (
            id, user_id, content_id, furthest_second_watched,
            is_completed, completed_at, last_accessed_at
        )
        SELECT
            MIN(id) AS id,
            user_id,
            content_id,
            MAX(COALESCE(furthest_second_watched, 0)) AS furthest_second_watched,
            MAX(COALESCE(is_completed, 0)) AS is_completed,
            MIN(completed_at) AS completed_at,
            MAX(last_accessed_at) AS last_accessed_at
        FROM user_progress
        GROUP BY user_id, content_id
        """
    )
    op.drop_table("user_progress")
    op.rename_table("user_progress_new", "user_progress")
    op.execute("PRAGMA foreign_keys=ON")


def _upgrade_other_dialects(bind) -> None:
    _dedupe_user_progress_rows(bind)

    op.create_unique_constraint(
        "uq_user_progress_user_content",
        "user_progress",
        ["user_id", "content_id"],
    )

    op.create_unique_constraint("uq_users_email", "users", ["email"])

    inspector = sa.inspect(bind)

    content_fk_name = next(
        (
            fk["name"]
            for fk in inspector.get_foreign_keys("content")
            if fk["constrained_columns"] == ["module_id"]
        ),
        None,
    )
    if content_fk_name:
        op.drop_constraint(content_fk_name, "content", type_="foreignkey")
    op.create_foreign_key(
        "fk_content_module_id_modules",
        "content",
        "modules",
        ["module_id"],
        ["id"],
        ondelete="CASCADE",
    )

    users_fk_name = next(
        (
            fk["name"]
            for fk in inspector.get_foreign_keys("users")
            if fk["constrained_columns"] == ["role_id"]
        ),
        None,
    )
    if users_fk_name:
        op.drop_constraint(users_fk_name, "users", type_="foreignkey")
    op.create_foreign_key(
        "fk_users_role_id_roles",
        "users",
        "roles",
        ["role_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    _assert_no_duplicate_emails(bind)

    if not _has_column(bind, "users", "status"):
        op.add_column(
            "users",
            sa.Column("status", sa.String(), nullable=True, server_default=sa.text("'active'")),
        )

    op.execute(
        """
        UPDATE users
        SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
        WHERE status IS NULL
        """
    )

    if dialect == "sqlite":
        _upgrade_sqlite(bind)
    else:
        _upgrade_other_dialects(bind)
        op.alter_column(
            "users",
            "status",
            existing_type=sa.String(),
            nullable=False,
            server_default=sa.text("'active'"),
        )


def _downgrade_sqlite() -> None:
    op.execute("PRAGMA foreign_keys=OFF")

    # Rebuild user_progress without unique(user_id, content_id).
    op.execute(
        """
        CREATE TABLE user_progress_old (
            id VARCHAR NOT NULL PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            content_id VARCHAR NOT NULL,
            furthest_second_watched INTEGER DEFAULT 0,
            is_completed BOOLEAN DEFAULT 0,
            completed_at DATETIME,
            last_accessed_at DATETIME,
            FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY(content_id) REFERENCES content (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        INSERT INTO user_progress_old (
            id, user_id, content_id, furthest_second_watched,
            is_completed, completed_at, last_accessed_at
        )
        SELECT
            id, user_id, content_id, furthest_second_watched,
            is_completed, completed_at, last_accessed_at
        FROM user_progress
        """
    )
    op.drop_table("user_progress")
    op.rename_table("user_progress_old", "user_progress")

    # Rebuild users without status and without unique email.
    op.execute(
        """
        CREATE TABLE users_old (
            id VARCHAR NOT NULL PRIMARY KEY,
            os_user_id VARCHAR NOT NULL UNIQUE,
            email VARCHAR NOT NULL,
            full_name VARCHAR NOT NULL,
            department_slug VARCHAR,
            org_id VARCHAR,
            is_app_admin BOOLEAN DEFAULT 0,
            role_id VARCHAR NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME,
            FOREIGN KEY(role_id) REFERENCES roles (id)
        )
        """
    )
    op.execute(
        """
        INSERT INTO users_old (
            id, os_user_id, email, full_name, department_slug, org_id,
            is_app_admin, role_id, is_active, created_at
        )
        SELECT
            id, os_user_id, email, full_name, department_slug, org_id,
            is_app_admin, role_id,
            CASE WHEN status = 'active' THEN 1 ELSE 0 END,
            created_at
        FROM users
        """
    )
    op.drop_table("users")
    op.rename_table("users_old", "users")
    op.create_index("ix_users_os_user_id", "users", ["os_user_id"], unique=True)

    # Rebuild content without ON DELETE CASCADE.
    op.execute(
        """
        CREATE TABLE content_old (
            id VARCHAR NOT NULL PRIMARY KEY,
            title VARCHAR NOT NULL,
            description TEXT,
            content_type VARCHAR NOT NULL,
            embed_url VARCHAR,
            document_url VARCHAR,
            module_id VARCHAR NOT NULL,
            sequence_index INTEGER DEFAULT 0,
            total_duration INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME,
            FOREIGN KEY(module_id) REFERENCES modules (id)
        )
        """
    )
    op.execute(
        """
        INSERT INTO content_old (
            id, title, description, content_type, embed_url, document_url,
            module_id, sequence_index, total_duration, is_active, created_at
        )
        SELECT
            id, title, description, content_type, embed_url, document_url,
            module_id, sequence_index, total_duration, is_active, created_at
        FROM content
        """
    )
    op.drop_table("content")
    op.rename_table("content_old", "content")

    op.execute("PRAGMA foreign_keys=ON")


def _downgrade_other_dialects(bind) -> None:
    op.drop_constraint("uq_user_progress_user_content", "user_progress", type_="unique")
    op.drop_constraint("uq_users_email", "users", type_="unique")

    inspector = sa.inspect(bind)

    content_fk_name = next(
        (
            fk["name"]
            for fk in inspector.get_foreign_keys("content")
            if fk["constrained_columns"] == ["module_id"]
        ),
        None,
    )
    if content_fk_name:
        op.drop_constraint(content_fk_name, "content", type_="foreignkey")
    op.create_foreign_key(
        "fk_content_module_id_modules",
        "content",
        "modules",
        ["module_id"],
        ["id"],
    )

    users_fk_name = next(
        (
            fk["name"]
            for fk in inspector.get_foreign_keys("users")
            if fk["constrained_columns"] == ["role_id"]
        ),
        None,
    )
    if users_fk_name:
        op.drop_constraint(users_fk_name, "users", type_="foreignkey")
    op.create_foreign_key(
        "fk_users_role_id_roles",
        "users",
        "roles",
        ["role_id"],
        ["id"],
    )

    op.execute(
        """
        UPDATE users
        SET is_active = CASE WHEN status = 'active' THEN TRUE ELSE FALSE END
        """
    )
    op.drop_column("users", "status")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        _downgrade_sqlite()
    else:
        _downgrade_other_dialects(bind)
