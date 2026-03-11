# Audit Report: Training App and Company OS Integration

**Date**: 2026-03-10
**Scope**: Recent changes in Training Module backend and frontend, and its integration with the Nagarkot OS Platform.

---

## 1. MODELS — FULL CURRENT STATE

The following is the complete current code of `backend/app/models.py`.

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime, Enum, Text, Table
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

# Maps a module to OS Department Slugs (e.g., 'tech', 'freight')
class ModuleDepartmentSlug(Base):
    __tablename__ = "module_department_slugs"
    module_id = Column(String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True)
    department_slug = Column(String, primary_key=True)

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
    id = Column(String, primary_key=True, default=generate_uuid)
    os_user_id = Column(String, unique=True, index=True, nullable=False) # The true identity link
    email = Column(String, index=True, nullable=False) # Read-only cache
    full_name = Column(String, nullable=False)         # Read-only cache
    department_slug = Column(String, nullable=True)    # Read-only cache from OS
    org_id = Column(String, nullable=True)             # Read-only cache from OS (client org)
    is_app_admin = Column(Boolean, default=False)      # Read-only cache from OS
    
    role_id = Column(String, ForeignKey("roles.id"), nullable=False)
    role = relationship("Role")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    module_type = Column(Enum(ModuleTypeEnum), default=ModuleTypeEnum.DEPARTMENT_TRAINING)
    
    roles = relationship("Role", secondary=module_roles, backref="modules")
    department_slugs = relationship("ModuleDepartmentSlug", cascade="all, delete-orphan")
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
    module_id = Column(String, ForeignKey("modules.id"), nullable=False)
    module = relationship("Module", back_populates="content_items")
    sequence_index = Column(Integer, default=0)
    total_duration = Column(Integer, nullable=True)  
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserProgress(Base):
    __tablename__ = "user_progress"
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
    consumed_at = Column(DateTime, default=datetime.utcnow)
    app_slug = Column(String, nullable=True)
```

### RECENT CHANGES BY MODEL/ASSOCIATION:

*   **`Role`**: *Unchanged* structure (ID, Name).
*   **`User`**:
    *   **New Field**: `os_user_id` (Primary identity link to OS).
    *   **New Field**: `department_slug` (Cached string for visibility logic).
    *   **New Field**: `org_id` (Cached organization link).
    *   **New Field**: `is_app_admin` (Permissions flag synced from OS).
    *   **Identity Logic**: Password/Username fields removed in favor of `os_user_id` and SSO.
*   **`Module`**:
    *   **New Association Table**: `module_department_slugs` (Replaces old `department_id` link with multi-select slugs).
    *   **New Association Table**: `module_client_orgs` (New targeting for client visibility).
    *   **New Field**: `sequence_index` (Supports custom ordering in UI).
    *   **New Enum**: `ModuleTypeEnum` (Department Training vs Client vs On-boarding).
*   **`module_roles`**: *Unchanged* structure.
*   **`Content`**:
    *   **New Field**: `sequence_index` (Supports drag-and-drop order).
    *   **Simplified Fields**: `embed_url` and `document_url` used for different content types.
*   **`UserProgress`**:
    *   **Cascade Delete**: Migration `migrate_cascade.py` added `ON DELETE CASCADE` to prevent orphan records when users are deleted via OS webhooks.
*   **`SsoTokenLog`**: (NEW) Tracks token IDs to prevent replay attacks during the SSO flow.
*   **`ModuleDepartmentSlug`**: (NEW) Mapping table for departmental targeting.
*   **`ModuleClientOrg`**: (NEW) Mapping table for client organization walls.

---

## 2. DATABASE — NEW TABLES AND MIGRATIONS

Alembic migrations in `backend/alembic/versions/` were not found during this audit. Instead, manual migration scripts were used for recent schema changes.

### NEW MIGRATIONS (MANUAL SCRIPTS):
**`backend/migrate_sso.py`**:
```python
"""One-time migration: add os_user_id column and create sso_token_log table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "nagarkot.db")

if not os.path.exists(db_path):
    print("nagarkot.db not found — column will be created on first server startup.")
else:
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Add os_user_id to users (ignore error if column already exists)
    try:
        cur.execute("ALTER TABLE users ADD COLUMN os_user_id VARCHAR")
        print("Added os_user_id column to users table.")
    except sqlite3.OperationalError as e:
        print(f"os_user_id: {e}")

    # Partial unique index
    try:
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_os_user_id "
            "ON users(os_user_id) WHERE os_user_id IS NOT NULL"
        )
        print("Created unique index on os_user_id.")
    except sqlite3.OperationalError as e:
        print(f"Index: {e}")

    con.commit()
    con.close()
    print("Migration complete.")
```

**`backend/migrate_cascade.py`**:
```python
import sqlite3

conn = sqlite3.connect("nagarkot.db")
cur = conn.cursor()

cur.executescript("""
PRAGMA foreign_keys = OFF;

CREATE TABLE user_progress_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    furthest_second_watched INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    completed_at DATETIME,
    last_accessed_at DATETIME
);

INSERT INTO user_progress_new SELECT * FROM user_progress;

DROP TABLE user_progress;

ALTER TABLE user_progress_new RENAME TO user_progress;

PRAGMA foreign_keys = ON;
""")

conn.commit()
conn.close()
```

---

## 3. SSO AND AUTH — FULL CURRENT STATE

### `backend/app/sso.py`:
This file handles the RS256 token verification and Just-In-Time (JIT) user syncing.
*   **Identity Sync**: Syncs `full_name`, `email`, `department_slug`, `org_id`, and `is_app_admin` from the OS payload.
*   **Replay Protection**: Verifies `SsoTokenLog` before consumption.
*   **Role Logic**: Assigns `ADMIN` if `is_app_admin` is true, otherwise uses `user_type` map.

### `backend/app/auth.py`:
Handles the local HS256 JWT sessions for the Training App.
*   `get_current_user` extracts the user based on the `sub` (local UUID) in the token.

---

## 4. MAIN.PY — FULL CURRENT ROUTE LIST AND CHANGED HANDLERS

The following is the current route configuration in `backend/app/main.py`.

### Route List:
*   `GET /`: Health check.
*   `POST /webhooks/os`: Handles user lifecycle events (deleted, deactivated, reactivated).
*   `POST /auth/login`: Proxies credentials to OS and syncs local user cache.
*   `GET /departments/`: Proxies OS departments (filtered for App Admins).
*   `GET /client-organizations/`: Proxies OS client organizations.
*   `GET /roles/`: Lists available roles.
*   `GET /users/me`: Current user profile.
*   `GET /users/`: (Admin) List users.
*   `PUT /admin/users/{user_id}`: (Admin) Update role/active status (enforces OS admin rules).
*   `GET /modules/`: Module list with complex visibility logic (dept/org targeting).
*   `POST /modules/`: Create module (handles dept/org/role associations).
*   `PUT /modules/{module_id}`: Update module.
*   `PUT /modules/{module_id}/reorder`: Toggle reorder.
*   `PUT /modules/{module_id}/move`: Drag and drop reorder.
*   `POST /content/`: Add content.
*   `PUT /content/{content_id}`: Update content.
*   `PUT /content/{content_id}/move`: Drag and drop reorder.
*   `POST /content/upload-document`: Multipart file upload.
*   `POST /progress/`: Update learner progress.
*   `GET /progress/`: Fetch own progress.
*   `GET /admin/reports/summary`: Admin report aggregated by user (scoped by admin dept).
*   `GET /admin/reports/user/{user_id}`: Detailed user report (scoped by admin dept).

### CHANGED HANDLER: `GET /modules/`
Enforces granular visibility:
*   **App Admins with Department**: Forced to see only modules tagged for their department.
*   **Clients**: Can only see modules tagged with `CLIENT` role matching their `org_id`.
*   **Employees**: Can see modules tagged with `EMPLOYEE` role matching their `department_slug` or global modules (no slugs).

---

## 5. WEBHOOK HANDLER — FULL CURRENT STATE

The webhook logic is located in `backend/app/main.py`.

```python
@app.post("/webhooks/os", status_code=200)
def os_webhook(
    payload: OsWebhookPayload,
    x_internal_key: str = Header(default=""),
    db: Session = Depends(get_db),
):
    if not INTERNAL_API_KEY or x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user = db.query(models.User).filter(
        models.User.os_user_id == payload.os_user_id
    ).first()

    if not user:
        return {"status": "ignored", "reason": "user_not_found"}

    if payload.event == "user.deleted":
        db.delete(user)
        db.commit()
        return {"status": "ok", "action": "hard_deleted"}

    if payload.event == "user.deactivated":
        user.is_active = False
        db.commit()
        return {"status": "ok", "action": "deactivated"}

    if payload.event == "user.reactivated":
        user.is_active = True
        db.commit()
        return {"status": "ok", "action": "reactivated"}

    return {"status": "ignored", "reason": "unknown_event"}
```

---

## 6. SCHEMAS — FULL CURRENT STATE

Complete current code of `backend/app/schemas.py`.

```python
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import ModuleTypeEnum, ContentTypeEnum

class UserResponse(BaseModel):
    id: str
    os_user_id: str
    email: EmailStr
    full_name: str
    department_slug: Optional[str] = None
    org_id: Optional[str] = None
    is_app_admin: bool
    role_id: str
    role: Optional["RoleResponse"] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ModuleCreate(BaseModel):
    title: str
    description: Optional[str] = None
    module_type: ModuleTypeEnum = ModuleTypeEnum.DEPARTMENT_TRAINING
    department_slugs: List[str] = []
    org_ids: List[str] = []
    role_ids: List[str] = []
    sequence_index: int = 0

class ModuleResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    module_type: ModuleTypeEnum
    sequence_index: int
    department_slugs: List[str] = []
    org_ids: List[str] = []
    roles: List["RoleResponse"] = []
    is_active: bool
    created_at: datetime
    content_items: List["ContentResponse"] = []

    class Config:
        from_attributes = True
```

---

## 7. FRONTEND CHANGES

### ADDED/MODIFIED FILES:
*   `frontend/src/pages/SsoPage.jsx`: (NEW) Handles the SSO login flow by consuming the token from the URL.
*   `frontend/src/components/AdminModulesTab.jsx`: Complete overhaul to a dual-pane builder with drag-and-drop.
*   `frontend/src/pages/LearnerDashboard.jsx`: Updated to filter modules by department/org tags.
*   `frontend/src/lib/api.js`: Refactored to using Axios with interceptors for auth and new endpoint integrations.

### Admin Targeting Logic (`AdminModulesTab.jsx`):
Added modals for selecting target audience between Employees (filtered by Department) and Clients (filtered by Organization Walls).

### SSO CONSUMPTION (`SsoPage.jsx`):
```javascript
useEffect(() => {
  const token = searchParams.get('token');
  if (!token) return;

  async function consumeToken() {
    const res = await fetch(`${API_BASE}/auth/sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    login(data.access_token, data.user);
    navigate('/');
  }
  consumeToken();
}, []);
```

---

## 8. NEW FILES (ROOT & BACKEND)

*   **`backend/cleanup_db.py`**: Manual script for reconciling duplicate admin accounts.
*   **`backend/debug_users.py`**: Prints all local users and their OS Identity links.
*   **`.pyre_configuration`**: Configures Pyre for type checking across the project.
*   **`backend/migrate_sso.py`**: One-time schema migration script.
*   **`backend/migrate_cascade.py`**: Adds `ON DELETE CASCADE` to progress tables.
