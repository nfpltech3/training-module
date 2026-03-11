import os
import shutil
import httpx
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel

from . import models, schemas
from .database import engine, get_db, SessionLocal
from .auth import (
    create_access_token, get_current_user, require_admin, require_manager,
)
from .sso import router as sso_router

# ── OS backend connection (for login proxy + webhooks) ──────────────
OS_BACKEND_URL = os.getenv("OS_BACKEND_URL", "http://localhost:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# --- Create Database tables ---
models.Base.metadata.create_all(bind=engine)

# --- Ensure uploads directory exists ---
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Nagarkot Knowledge Sharing & Tracking Platform API",
    description="Backend API for managing training content, tracking, and auth.",
    version="2.0.0",
)

# --- Serve uploaded documents as static files ---
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# --- Startup: Seed data ---
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # 1. Seed Roles
        default_roles = ["ADMIN", "MANAGER", "TEAM LEAD", "EMPLOYEE", "CLIENT"]
        for role_name in default_roles:
            if not db.query(models.Role).filter(func.lower(models.Role.name) == role_name.lower()).first():
                db.add(models.Role(name=role_name))
        db.commit()

        # 2. Skip Admin Seed — Handled by OS JIT Provisioning
    finally:
        db.close()

# --- CORS ---
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://192.168.1.23:5173,http://192.168.1.23:5174,http://192.168.1.23:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Nagarkot Knowledge Platform API v2 is running"}


# ── OS webhook — user lifecycle events ───────────────────────────────
class OsWebhookPayload(BaseModel):
    event: str           # 'user.deleted' | 'user.deactivated' | 'user.reactivated'
    os_user_id: str
    email: str
    timestamp: str

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
        print(f"[OS webhook] {payload.event}: hard-deleted user {payload.os_user_id} ({payload.email})")
        return {"status": "ok", "action": "hard_deleted"}

    if payload.event == "user.deactivated":
        user.is_active = False
        db.commit()
        print(f"[OS webhook] {payload.event}: deactivated user {payload.os_user_id} ({payload.email})")
        return {"status": "ok", "action": "deactivated"}

    if payload.event == "user.reactivated":
        user.is_active = True
        db.commit()
        print(f"[OS webhook] {payload.event}: reactivated user {payload.os_user_id} ({payload.email})")
        return {"status": "ok", "action": "reactivated"}

    return {"status": "ignored", "reason": "unknown_event"}


# ── SSO router ────────────────────────────────────────────────────
app.include_router(sso_router, prefix="/auth", tags=["SSO"])


# =====================================================================
#  AUTH & USERS
# =====================================================================
@app.post("/auth/login")
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Direct logins forward credentials to the OS verify-password internal API."""
    try:
        os_res = httpx.post(
            f"{OS_BACKEND_URL}/auth/verify-password",
            json={"email": payload.identifier, "password": payload.password, "app_slug": "trainings"},
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=10.0,
        )
        if os_res.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        os_data = os_res.json()
        if not os_data.get("valid"):
            reason = os_data.get("reason", "")
            if reason == "no_app_access":
                raise HTTPException(status_code=403, detail="You do not have access to the Training application.")
            raise HTTPException(status_code=401, detail="Invalid email or password")

        os_user = os_data["user"]
        print(f"[DEBUG] OS user payload: {os_user}")

    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="OS identity server unreachable")

    os_user_id = os_user["os_user_id"]
    is_app_admin = os_user.get("is_app_admin", False)
    is_team_lead = os_user.get("is_team_lead", False)
    user_type = os_user.get("user_type", "employee")

    def resolve_role_name(is_app_admin, is_team_lead, user_type):
        if is_app_admin:
            return "ADMIN"
        if is_team_lead:
            return "TEAM LEAD"
        if user_type == "client":
            return "CLIENT"
        return "EMPLOYEE"

    # JIT Provision or Sync Cache
    user = db.query(models.User).filter(models.User.os_user_id == os_user_id).first()
    role_name = resolve_role_name(is_app_admin, is_team_lead, user_type)
    role = db.query(models.Role).filter(models.Role.name == role_name).first()

    if not user:
        user = models.User(
            os_user_id=os_user_id,
            email=os_user.get("email"),
            full_name=os_user.get("name"),
            department_slug=os_user.get("department_slug"),
            org_id=os_user.get("org_id"),
            is_app_admin=is_app_admin,
            role_id=role.id
        )
        db.add(user)
    else:
        # Sync read-only cache on every login
        user.email = os_user.get("email")
        user.full_name = os_user.get("name")
        user.department_slug = os_user.get("department_slug")
        user.org_id = os_user.get("org_id")
        user.is_app_admin = is_app_admin
        if role:
            user.role_id = role.id

    db.commit()
    db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated by OS")

    token = create_access_token(data={"sub": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": {"name": user.role.name},
            "department_slug": user.department_slug,
            "org_id": user.org_id
        }
    }


# =====================================================================
#  DEPARTMENTS
# =====================================================================
@app.get("/departments/")
def get_departments(current_user: models.User = Depends(get_current_user)):
    """Fetch live departments directly from the OS for the Admin UI Builder."""
    try:
        res = httpx.get(
            f"{OS_BACKEND_URL}/users/internal/departments",
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=5.0
        )
        if res.status_code == 200:
            return res.json()
        return []
    except httpx.RequestError:
        return []


@app.get("/departments/assignable")
def get_assignable_departments(current_user: models.User = Depends(require_manager)):
    # FIX: Uses require_manager so Team Leads can reach this endpoint.
    # Role-based scoping is then applied below.
    role_name = current_user.role.name.upper() if current_user.role else "EMPLOYEE"

    try:
        res = httpx.get(
            f"{OS_BACKEND_URL}/users/internal/departments",
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=5.0
        )
        if res.status_code != 200:
            return []

        all_depts = res.json()

        # Team Leads can only assign to their own department or General (no dept).
        # App Admins (ADMIN role) can assign to any department.
        if role_name == "TEAM LEAD" and current_user.department_slug:
            return [d for d in all_depts if d["slug"] == current_user.department_slug]

        return all_depts

    except httpx.RequestError:
        return []


# =====================================================================
#  CLIENT ORGANIZATIONS & ROLES
# =====================================================================
@app.get("/client-organizations/")
def get_client_organizations(current_user: models.User = Depends(get_current_user)):
    """Proxy to fetch live Organizations from the OS for client-facing content targeting."""
    try:
        res = httpx.get(
            f"{OS_BACKEND_URL}/organizations/",
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=5.0
        )
        if res.status_code == 200:
            return res.json()
        return []
    except httpx.RequestError:
        return []


@app.get("/roles/", response_model=List[schemas.RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    # Only return roles that are valid module content tags.
    # ADMIN and TEAM LEAD are user-level roles, not content visibility tags.
    MODULE_ROLES = ["MANAGER", "EMPLOYEE", "CLIENT"]
    return db.query(models.Role).filter(models.Role.name.in_(MODULE_ROLES)).all()


# =====================================================================
#  USERS
# =====================================================================
@app.get("/users/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/users/", response_model=List[schemas.UserResponse])
def get_users(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    # Strict ADMIN only — Team Leads cannot list/manage users.
    return db.query(models.User).all()


@app.put("/admin/users/{user_id}", response_model=schemas.UserResponse)
def admin_update_user(
    user_id: str,
    payload: schemas.AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin)  # Strict ADMIN only
):
    """Training admins can ONLY update training roles and active status here."""
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "role_id" in update_data and update_data["role_id"] is not None:
        admin_role = db.query(models.Role).filter(models.Role.name == "ADMIN").first()
        if admin_role and update_data["role_id"] == admin_role.id:
            if not db_user.is_app_admin:
                raise HTTPException(
                    status_code=403,
                    detail="ADMIN role can only be granted via OS portal (is_app_admin flag)."
                )

    for key, value in update_data.items():
        if value is not None:
            setattr(db_user, key, value)

    db.commit()
    db.refresh(db_user)

    if 'is_active' in update_data and not update_data['is_active']:
        if db_user.os_user_id:
            try:
                httpx.patch(
                    f"{OS_BACKEND_URL}/users/{db_user.os_user_id}",
                    json={"is_active": False},
                    headers={"x-internal-key": INTERNAL_API_KEY},
                    timeout=5.0,
                )
            except httpx.RequestError:
                print(f"WARNING: Could not deactivate user {db_user.os_user_id} in OS")

    return db_user


# =====================================================================
#  MODULES
# =====================================================================
@app.get("/modules/", response_model=List[schemas.ModuleResponse])
def get_modules(
    department_slug: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Module).options(
        joinedload(models.Module.department_slugs),
        joinedload(models.Module.roles),
        joinedload(models.Module.content_items),
    ).filter(models.Module.is_active == True)

    user_role_name = current_user.role.name.upper()

    if user_role_name == "ADMIN":
        # Super Admin (no dept) sees everything.
        # App Admin (has dept) sees their dept + General modules.
        if current_user.department_slug:
            query = query.filter(
                ~models.Module.department_slugs.any() |
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == current_user.department_slug
                )
            )
        elif department_slug:
            query = query.filter(
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == department_slug
                )
            )

    elif user_role_name == "TEAM LEAD":
        # FIX: Team Leads see MANAGER + EMPLOYEE modules for their dept + General.
        query = query.filter(
            models.Module.roles.any(models.Role.name.in_(["EMPLOYEE", "MANAGER"])),
            (
                ~models.Module.department_slugs.any() |
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == current_user.department_slug
                )
            )
        )

    elif user_role_name == "CLIENT":
        query = query.filter(models.Module.roles.any(models.Role.name.ilike("CLIENT")))
        if current_user.org_id:
            query = query.filter(
                ~models.Module.client_orgs.any() |
                models.Module.client_orgs.any(
                    models.ModuleClientOrg.org_id == current_user.org_id
                )
            )

    else:
        # EMPLOYEE — only EMPLOYEE-tagged modules for their dept + General.
        query = query.filter(
            models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
            (
                ~models.Module.department_slugs.any() |
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == current_user.department_slug
                )
            )
        )

    modules = query.order_by(models.Module.sequence_index).all()

    return [
        {
            **m.__dict__,
            "department_slugs": [d.department_slug for d in m.department_slugs],
            "org_ids": [c.org_id for c in m.client_orgs],
            "roles": m.roles,
            "content_items": m.content_items,
            "is_active": m.is_active,
            "created_at": m.created_at
        }
        for m in modules
    ]


@app.post("/modules/", response_model=schemas.ModuleResponse)
def create_module(
    module: schemas.ModuleCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)  # ADMIN + TEAM LEAD can create
):
    roles = db.query(models.Role).filter(models.Role.id.in_(module.role_ids)).all()
    max_seq = db.query(func.max(models.Module.sequence_index)).scalar() or 0

    db_module = models.Module(
        title=module.title,
        description=module.description,
        module_type=module.module_type,
        sequence_index=module.sequence_index if module.sequence_index else max_seq + 1
    )

    # FIX: Restrict by ROLE, not by whether dept is set.
    # Team Leads can only tag their own dept or General.
    # App Admins (ADMIN role) can tag any dept.
    if admin.role.name.upper() == "TEAM LEAD":
        allowed = {admin.department_slug}
        incoming = set(module.department_slugs)
        if incoming and not incoming.issubset(allowed):
            raise HTTPException(
                status_code=403,
                detail=f"Team Leads can only assign modules to their own department ({admin.department_slug}) or General."
            )

    db_module.department_slugs = [models.ModuleDepartmentSlug(department_slug=slug) for slug in module.department_slugs]
    db_module.client_orgs = [models.ModuleClientOrg(org_id=oid) for oid in module.org_ids]
    db_module.roles = roles

    db.add(db_module)
    db.commit()
    db.refresh(db_module)

    return {
        **db_module.__dict__,
        "department_slugs": [d.department_slug for d in db_module.department_slugs],
        "org_ids": [c.org_id for c in db_module.client_orgs],
        "roles": db_module.roles,
        "content_items": db_module.content_items
    }


@app.put("/modules/{module_id}", response_model=schemas.ModuleResponse)
def update_module(
    module_id: str,
    payload: schemas.ModuleUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)  # ADMIN + TEAM LEAD can update
):
    db_module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not db_module:
        raise HTTPException(status_code=404, detail="Module not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "department_slugs" in update_data:
        slugs = update_data.pop("department_slugs")

        # FIX: Same role-based guard as create.
        if admin.role.name.upper() == "TEAM LEAD":
            allowed = {admin.department_slug}
            if slugs and not set(slugs).issubset(allowed):
                raise HTTPException(
                    status_code=403,
                    detail=f"Team Leads can only assign modules to their own department ({admin.department_slug}) or General."
                )

        db.query(models.ModuleDepartmentSlug).filter(
            models.ModuleDepartmentSlug.module_id == module_id
        ).delete()
        db_module.department_slugs = [models.ModuleDepartmentSlug(department_slug=slug) for slug in slugs]

    if "org_ids" in update_data:
        org_ids = update_data.pop("org_ids")
        db.query(models.ModuleClientOrg).filter(
            models.ModuleClientOrg.module_id == module_id
        ).delete()
        db_module.client_orgs = [models.ModuleClientOrg(org_id=oid) for oid in org_ids]

    if "role_ids" in update_data:
        role_ids = update_data.pop("role_ids")
        db_module.roles = db.query(models.Role).filter(models.Role.id.in_(role_ids)).all()

    for key, value in update_data.items():
        setattr(db_module, key, value)

    db.commit()
    db.refresh(db_module)

    return {
        **db_module.__dict__,
        "department_slugs": [d.department_slug for d in db_module.department_slugs],
        "org_ids": [c.org_id for c in db_module.client_orgs],
        "roles": db_module.roles,
        "content_items": db_module.content_items
    }


@app.put("/modules/{module_id}/reorder")
def reorder_module(
    module_id: str,
    payload: schemas.ReorderRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    siblings = db.query(models.Module).filter(
        models.Module.is_active == True
    ).order_by(models.Module.sequence_index).all()
    idx = next((i for i, m in enumerate(siblings) if m.id == module_id), None)

    if idx is None:
        raise HTTPException(status_code=404, detail="Module not in list")

    if payload.direction == "up" and idx > 0:
        swap_target = siblings[idx - 1]
    elif payload.direction == "down" and idx < len(siblings) - 1:
        swap_target = siblings[idx + 1]
    else:
        return {"detail": "Already at boundary"}

    module.sequence_index, swap_target.sequence_index = swap_target.sequence_index, module.sequence_index
    db.commit()
    return {"detail": "Reorder successful"}


@app.put("/modules/{module_id}/move")
def move_module(
    module_id: str,
    payload: schemas.MoveRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    new_index = payload.new_index
    old_index = module.sequence_index

    if old_index == new_index:
        return {"detail": "No change"}

    siblings = db.query(models.Module).filter(models.Module.is_active == True).all()

    for sib in siblings:
        if old_index < new_index:
            if old_index < sib.sequence_index <= new_index:
                sib.sequence_index -= 1
        else:
            if new_index <= sib.sequence_index < old_index:
                sib.sequence_index += 1

    module.sequence_index = new_index
    db.commit()
    return {"detail": "Move successful"}


# =====================================================================
#  CONTENT
# =====================================================================
@app.post("/content/", response_model=schemas.ContentResponse)
def create_content(
    content: schemas.ContentCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    max_seq = db.query(func.max(models.Content.sequence_index)).filter(
        models.Content.module_id == content.module_id
    ).scalar() or 0
    db_content = models.Content(**content.model_dump())
    if db_content.sequence_index == 0:
        db_content.sequence_index = max_seq + 1
    db.add(db_content)
    db.commit()
    db.refresh(db_content)
    return db_content


@app.put("/content/{content_id}", response_model=schemas.ContentResponse)
def update_content(
    content_id: str,
    payload: schemas.ContentUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    db_content = db.query(models.Content).filter(models.Content.id == content_id).first()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_content, key, value)
    db.commit()
    db.refresh(db_content)
    return db_content


@app.put("/content/{content_id}/reorder")
def reorder_content(
    content_id: str,
    payload: schemas.ReorderRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    content = db.query(models.Content).filter(models.Content.id == content_id).first()
    siblings = db.query(models.Content).filter(
        models.Content.module_id == content.module_id,
        models.Content.is_active == True
    ).order_by(models.Content.sequence_index).all()
    idx = next((i for i, c in enumerate(siblings) if c.id == content_id), None)

    if payload.direction == "up" and idx > 0:
        swap_target = siblings[idx - 1]
    elif payload.direction == "down" and idx < len(siblings) - 1:
        swap_target = siblings[idx + 1]
    else:
        return {"detail": "Already at boundary"}

    content.sequence_index, swap_target.sequence_index = swap_target.sequence_index, content.sequence_index
    db.commit()
    return {"detail": "Reorder successful"}


@app.put("/content/{content_id}/move")
def move_content(
    content_id: str,
    payload: schemas.MoveRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)
):
    content = db.query(models.Content).filter(models.Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    new_index = payload.new_index
    old_index = content.sequence_index

    if old_index == new_index:
        return {"detail": "No change"}

    siblings = db.query(models.Content).filter(
        models.Content.module_id == content.module_id,
        models.Content.is_active == True
    ).all()

    for sib in siblings:
        if old_index < new_index:
            if old_index < sib.sequence_index <= new_index:
                sib.sequence_index -= 1
        else:
            if new_index <= sib.sequence_index < old_index:
                sib.sequence_index += 1

    content.sequence_index = new_index
    db.commit()
    return {"detail": "Move successful"}


@app.post("/content/upload-document")
def upload_document(
    file: UploadFile = File(...),
    admin: models.User = Depends(require_manager)
):
    ext = os.path.splitext(file.filename)[1].lower()
    safe_name = f"{models.generate_uuid()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"document_url": f"/uploads/{safe_name}", "original_name": file.filename}


# =====================================================================
#  PROGRESS
# =====================================================================
@app.post("/progress/", response_model=schemas.ProgressResponse)
def update_progress(
    progress: schemas.ProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_progress = db.query(models.UserProgress).filter_by(
        user_id=current_user.id, content_id=progress.content_id
    ).first()
    if not db_progress:
        db_progress = models.UserProgress(
            user_id=current_user.id,
            content_id=progress.content_id,
            furthest_second_watched=progress.furthest_second_watched,
            is_completed=progress.is_completed,
            completed_at=datetime.utcnow() if progress.is_completed else None,
        )
        db.add(db_progress)
    else:
        if progress.furthest_second_watched > db_progress.furthest_second_watched:
            db_progress.furthest_second_watched = progress.furthest_second_watched
        if progress.is_completed and not db_progress.is_completed:
            db_progress.is_completed = True
            db_progress.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_progress)
    return db_progress


@app.get("/progress/", response_model=List[schemas.ProgressResponse])
def get_my_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return db.query(models.UserProgress).filter(
        models.UserProgress.user_id == current_user.id
    ).all()


# =====================================================================
#  ADMIN REPORTS
# =====================================================================
@app.get("/admin/reports/summary", response_model=List[schemas.UserSummaryReport])
def admin_report_summary(
    department_slug: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)  # FIX: was require_admin
):
    admin_role_name = admin.role.name.upper() if admin.role else "EMPLOYEE"

    users_query = db.query(models.User).filter(
        models.User.is_active == True,
        models.User.role.has(models.Role.name.in_(["EMPLOYEE", "ADMIN", "TEAM LEAD"]))
    )

    if admin_role_name == "TEAM LEAD":
        # Team Leads only see users in their own department.
        users_query = users_query.filter(
            models.User.department_slug == admin.department_slug
        )
    elif admin_role_name == "ADMIN":
        # App Admins and Super Admins see all users.
        # Optional dept filter for Super Admin UI drill-down.
        if department_slug:
            users_query = users_query.filter(
                models.User.department_slug == department_slug
            )

    results = []
    for user in users_query.all():
        user_role_name = user.role.name.upper() if user.role else "EMPLOYEE"

        # FIX: ADMIN and TEAM LEAD users see MANAGER + EMPLOYEE modules.
        # Pure EMPLOYEEs only see EMPLOYEE modules.
        if user_role_name in ["ADMIN", "TEAM LEAD"]:
            visible_content_count = db.query(func.count(models.Content.id)).join(models.Module).filter(
                models.Module.roles.any(models.Role.name.in_(["EMPLOYEE", "MANAGER"])),
                (
                    ~models.Module.department_slugs.any() |
                    models.Module.department_slugs.any(
                        models.ModuleDepartmentSlug.department_slug == user.department_slug
                    )
                ),
                models.Module.is_active == True,
                models.Content.is_active == True
            ).scalar()
        else:
            visible_content_count = db.query(func.count(models.Content.id)).join(models.Module).filter(
                models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
                (
                    ~models.Module.department_slugs.any() |
                    models.Module.department_slugs.any(
                        models.ModuleDepartmentSlug.department_slug == user.department_slug
                    )
                ),
                models.Module.is_active == True,
                models.Content.is_active == True
            ).scalar()

        completed_count = db.query(func.count(models.UserProgress.id)).filter(
            models.UserProgress.user_id == user.id,
            models.UserProgress.is_completed == True
        ).scalar()

        results.append(schemas.UserSummaryReport(
            user_id=user.id,
            full_name=user.full_name,
            department_slug=user.department_slug,
            total_visible=visible_content_count,
            completed=completed_count,
            pending=visible_content_count - completed_count,
        ))
    return results


@app.get("/admin/reports/user/{user_id}", response_model=List[schemas.UserDetailedReport])
def admin_report_user_detail(
    user_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_manager)  # FIX: was require_admin
):
    admin_role_name = admin.role.name.upper() if admin.role else "EMPLOYEE"

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Team Leads can only view their own department's users.
    if admin_role_name == "TEAM LEAD" and user.department_slug != admin.department_slug:
        raise HTTPException(
            status_code=403,
            detail="You are only authorized to view reports for users in your department."
        )

    target_role_name = user.role.name.upper() if user.role else "EMPLOYEE"

    # FIX: Mirror the same module visibility logic used in the dashboard.
    if target_role_name in ["ADMIN", "TEAM LEAD"]:
        visible_content = db.query(models.Content, models.Module).join(models.Module).filter(
            models.Module.roles.any(models.Role.name.in_(["EMPLOYEE", "MANAGER"])),
            (
                ~models.Module.department_slugs.any() |
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == user.department_slug
                )
            ),
            models.Module.is_active == True,
            models.Content.is_active == True
        ).order_by(models.Module.sequence_index, models.Content.sequence_index).all()
    else:
        visible_content = db.query(models.Content, models.Module).join(models.Module).filter(
            models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
            (
                ~models.Module.department_slugs.any() |
                models.Module.department_slugs.any(
                    models.ModuleDepartmentSlug.department_slug == user.department_slug
                )
            ),
            models.Module.is_active == True,
            models.Content.is_active == True
        ).order_by(models.Module.sequence_index, models.Content.sequence_index).all()

    progress_map = {
        p.content_id: p
        for p in db.query(models.UserProgress).filter(
            models.UserProgress.user_id == user_id
        ).all()
    }

    results = []
    for content, module in visible_content:
        prog = progress_map.get(content.id)
        results.append(schemas.UserDetailedReport(
            user_id=user.id,
            full_name=user.full_name,
            module_title=module.title,
            content_title=content.title,
            content_type=content.content_type,
            is_completed=prog.is_completed if prog else False,
            completed_at=prog.completed_at if prog and prog.is_completed else None,
        ))
    return results