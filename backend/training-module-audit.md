# Training Module Backend Audit

This document contains the collected configuration, models, and database state for the Training Module backend.

## 1. Alembic Baseline Schema
File: `alembic/versions/20260313_000001_baseline_schema.py`

```python
"""baseline_schema

Revision ID: 20260313_000001
Revises:
Create Date: 2026-03-13 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260313_000001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    module_type_enum = sa.Enum(
        "DEPARTMENT_TRAINING",
        "CLIENT_TRAINING",
        "ON_BOARDING",
        name="moduletypeenum",
    )
    content_type_enum = sa.Enum(
        "VIDEO",
        "DOCUMENT",
        name="contenttypeenum",
    )

    module_type_enum.create(op.get_bind(), checkfirst=True)
    content_type_enum.create(op.get_bind(), checkfirst=True)

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
        sa.Column("module_type", module_type_enum, nullable=True),
        sa.Column("sequence_index", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

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
        sa.Column("content_type", content_type_enum, nullable=False),
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
```

## 2. Alembic Environment Config
File: `alembic/env.py`

```python
import os
from logging.config import fileConfig

from sqlalchemy import create_engine
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import Base and all models so autogenerate sees every table
from app.database import Base  # noqa: E402
from app.db_config import DATABASE_URL  # noqa: E402
from app import models  # noqa: E402, F401

# Pull DATABASE_URL from environment (overrides alembic.ini sqlalchemy.url)
config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL to stdout)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connect to a live DB)."""
    connectable = create_engine(DATABASE_URL, poolclass=pool.NullPool, pool_pre_ping=True)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,  # detect column type changes
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

## 3. Alembic Configuration
File: `alembic.ini`

```ini
[alembic]
script_location = %(here)s/alembic
prepend_sys_path = .
path_separator = os
sqlalchemy.url = postgresql+psycopg://postgres:postgres@localhost:5432/nagarkot_training
# NOTE: This is overridden at runtime by DATABASE_URL env var in alembic/env.py.

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

## 4. SQLAlchemy Models
File: `app/models.py`

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime, Enum, Text, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

class ModuleTypeEnum(str, enum.Enum):
    DEPARTMENT_TRAINING = "Department Training"
    CLIENT_TRAINING = "Client Training"
    ON_BOARDING = "On-Boarding"

class ContentTypeEnum(str, enum.Enum):
    VIDEO = "VIDEO"
    DOCUMENT = "DOCUMENT"

# --- Association Tables ---
module_roles = Table(
    'module_roles', Base.metadata,
    Column('module_id', String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True),
    Column('role_id', String, ForeignKey('roles.id', ondelete="CASCADE"), primary_key=True)
)

# Local cache of OS departments — kept in sync via webhooks
class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=generate_uuid)
    os_department_id = Column(String, unique=True, index=True, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, default='active')  # 'active' | 'deleted'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Maps modules to local departments via FK (guarantees referential integrity)
class ModuleDepartment(Base):
    __tablename__ = "module_departments"
    module_id = Column(String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True)
    department_id = Column(String, ForeignKey('departments.id', ondelete="CASCADE"), primary_key=True)
    department = relationship("Department")

# Maps a module to specific OS Client Organizations (org walls)
class ModuleClientOrg(Base):
    __tablename__ = "module_client_orgs"
    module_id = Column(String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True)
    org_id = Column(String, primary_key=True)

class Role(Base):
    __tablename__ = "roles"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False)

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    os_user_id = Column(String, unique=True, index=True, nullable=False) # The true identity link
    email = Column(String, nullable=False) # Read-only cache
    full_name = Column(String, nullable=False)         # Read-only cache
    department_slug = Column(String, nullable=True)    # Read-only cache from OS
    org_id = Column(String, nullable=True)             # Read-only cache from OS (client org)
    is_app_admin = Column(Boolean, default=False)      # Read-only cache from OS
    
    role_id = Column(String, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    role = relationship("Role")
    status = Column(String, default="active", nullable=False)  # 'active' | 'disabled' | 'deleted'
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_active(self):
        return self.status == "active"

    @is_active.setter
    def is_active(self, value: bool):
        self.status = "active" if value else "disabled"

class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    module_type = Column(Enum(ModuleTypeEnum), nullable=True, default=None)
    
    roles = relationship("Role", secondary=module_roles, backref="modules")
    departments = relationship("ModuleDepartment", cascade="all, delete-orphan")
    client_orgs = relationship("ModuleClientOrg", cascade="all, delete-orphan")
    
    sequence_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    content_items = relationship(
        "Content", back_populates="module",
        order_by="Content.sequence_index"
    )

class Content(Base):
    __tablename__ = "content"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content_type = Column(Enum(ContentTypeEnum), nullable=False)
    embed_url = Column(String, nullable=True)       
    document_url = Column(String, nullable=True)     
    module_id = Column(String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    module = relationship("Module", back_populates="content_items")
    sequence_index = Column(Integer, default=0)
    total_duration = Column(Integer, nullable=True)  
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserProgress(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "content_id", name="uq_user_progress_user_content"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_id = Column(String, ForeignKey("content.id", ondelete="CASCADE"), nullable=False)
    furthest_second_watched = Column(Integer, default=0) 
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SsoTokenLog(Base):
    __tablename__ = "sso_token_log"
    token_id = Column(String, primary_key=True)
    used = Column(Boolean, default=True)
    consumed_at = Column(DateTime, default=datetime.utcnow, index=True)
    app_slug = Column(String, nullable=True)
```

## 5. Docker Compose
File: `docker-compose.yml` (root level)

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    restart: always
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      - OS_BACKEND_URL=http://host.docker.internal:3001
      - INTERNAL_API_KEY=${INTERNAL_API_KEY:-nagarkot-internal-dev-key-2024}
    depends_on:
      - db
    extra_hosts:
      - "host.docker.internal:host-gateway"

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "80:80"

volumes:
  postgres_data:
```

## 6. Dockerfile (Backend)
File: `backend/Dockerfile`

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 7. Dokploy Config
No `dokploy.yml` or similar config file was found in the project root.

## 8. Alembic Version Table
Query: `SELECT * FROM alembic_version;`
Status: **Table does not exist.**
This is consistent with the migration failing at the start of the process.

## 9. Postgres Enumerated Types
Query: `SELECT typname FROM pg_type WHERE typname LIKE '%enum%';`
Output:
- `anyenum`
- `pg_enum`
- `_pg_enum`

**Note:** Specific types `moduletypeenum` and `contenttypeenum` were not found in the `pg_type` table using wildcard or exact searches on `localhost:5432/nagarkot_trainings`. This suggests the database is currently blank, despite the `DuplicateObject` error reported during migration.

## 10. Database Connection String
Masked credentials:
`postgresql+psycopg://postgres:****@localhost:5432/nagarkot_trainings`
Structure: `postgresql+psycopg://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB_NAME]`
