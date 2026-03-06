import os
import shutil
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from . import models, schemas
from .database import engine, get_db, SessionLocal
from .auth import (
    hash_password, verify_password,
    create_access_token, get_current_user, require_admin,
)

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
        # Seed default departments
        default_depts = [
            {"name": "All", "is_global": True},
            {"name": "Onboarding", "is_global": True},
            {"name": "Freight Forwarding", "is_global": False},
            {"name": "Accounts", "is_global": False},
            {"name": "Tech", "is_global": False},
            {"name": "Documentation", "is_global": False},
        ]
        for dept_data in default_depts:
            existing = db.query(models.Department).filter(
                models.Department.name == dept_data["name"]
            ).first()
            if not existing:
                db.add(models.Department(**dept_data))
        db.commit()

        # Seed admin user
        admin_dept = db.query(models.Department).filter(
            models.Department.name == "All"
        ).first()
        admin = db.query(models.User).filter(
            models.User.email == "admin@nagarkot.com"
        ).first()
        if not admin and admin_dept:
            db.add(models.User(
                email="admin@nagarkot.com",
                username="admin",
                password_hash=hash_password("admin123"),
                full_name="Super Administrator",
                department_id=admin_dept.id,
                role=models.RoleEnum.ADMIN,
            ))
            db.commit()
    finally:
        db.close()


# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
#  HEALTH CHECK
# =====================================================================
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Nagarkot Knowledge Platform API v2 is running"}


# =====================================================================
#  AUTH ENDPOINTS
# =====================================================================
@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Authenticate via email or username. Returns JWT + user object."""
    identifier = payload.identifier.lower().strip()
    user = db.query(models.User).filter(
        (func.lower(models.User.email) == identifier) |
        (func.lower(models.User.username) == identifier)
    ).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email/username or password",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token(data={"sub": user.id})
    return schemas.TokenResponse(
        access_token=token,
        user=schemas.UserResponse.model_validate(user),
    )


# =====================================================================
#  DEPARTMENT ENDPOINTS
# =====================================================================
@app.get("/departments/", response_model=List[schemas.DepartmentResponse])
def get_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).all()


@app.post("/departments/", response_model=schemas.DepartmentResponse)
def create_department(
    dept: schemas.DepartmentCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    existing = db.query(models.Department).filter(
        models.Department.name == dept.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department already exists")

    db_dept = models.Department(**dept.model_dump())
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    return db_dept


@app.put("/departments/{dept_id}", response_model=schemas.DepartmentResponse)
def update_department(
    dept_id: str,
    payload: schemas.DepartmentUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    db_dept = db.query(models.Department).filter(
        models.Department.id == dept_id
    ).first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="Department not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_dept, key, value)

    db.commit()
    db.refresh(db_dept)
    return db_dept


# =====================================================================
#  USER ENDPOINTS
# =====================================================================
@app.post("/users/", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    db_user = models.User(
        email=user.email,
        username=user.username or user.email,
        password_hash=hash_password(user.password),
        full_name=user.full_name,
        department_id=user.department_id,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.get("/users/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Returns the currently authenticated user."""
    return current_user


@app.put("/users/me", response_model=schemas.UserResponse)
def update_me(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.username is not None:
        existing = db.query(models.User).filter(
            models.User.username == payload.username,
            models.User.id != current_user.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = payload.username

    if payload.password is not None:
        current_user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(current_user)
    return current_user


@app.get("/users/", response_model=List[schemas.UserResponse])
def get_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    return db.query(models.User).all()


@app.put("/admin/users/{user_id}", response_model=schemas.UserResponse)
def admin_update_user(
    user_id: str,
    payload: schemas.AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Handle password separately
    if "password" in update_data:
        if update_data["password"]:
            db_user.password_hash = hash_password(update_data["password"])
        del update_data["password"]

    # Handle email uniqueness
    if "email" in update_data and update_data["email"] and update_data["email"] != db_user.email:
        existing = db.query(models.User).filter(
            models.User.email == update_data["email"],
            models.User.id != user_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")
        db_user.email = update_data["email"]
    update_data.pop("email", None)

    # Handle username uniqueness
    if "username" in update_data and update_data["username"] and update_data["username"] != db_user.username:
        existing = db.query(models.User).filter(
            models.User.username == update_data["username"],
            models.User.id != user_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        db_user.username = update_data["username"]
    update_data.pop("username", None)

    # Set remaining safe fields
    for key, value in update_data.items():
        if value is not None:
            setattr(db_user, key, value)

    db.commit()
    db.expire(db_user)
    db.refresh(db_user)
    return db_user


# =====================================================================
#  MODULE ENDPOINTS
# =====================================================================
def _get_visible_dept_ids(user: models.User, db: Session) -> list[str]:
    """Returns the list of department IDs whose content this user should see."""
    global_ids = [
        d.id for d in db.query(models.Department).filter(
            models.Department.is_global == True  # noqa: E712
        ).all()
    ]
    visible = set(global_ids)
    visible.add(user.department_id)
    return list(visible)


@app.get("/modules/", response_model=List[schemas.ModuleResponse])
def get_modules(
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns modules with nested content_items.
    - Admins: see all modules (optionally filtered by department_id).
    - Users: see only modules from their department + global departments.
    """
    query = db.query(models.Module).options(
        joinedload(models.Module.department),
        joinedload(models.Module.content_items),
    ).filter(models.Module.is_active == True)  # noqa: E712

    if current_user.role == models.RoleEnum.ADMIN:
        if department_id:
            query = query.filter(models.Module.department_id == department_id)
    else:
        visible_ids = _get_visible_dept_ids(current_user, db)
        query = query.filter(models.Module.department_id.in_(visible_ids))

    return query.order_by(models.Module.sequence_index).all()


@app.post("/modules/", response_model=schemas.ModuleResponse)
def create_module(
    module: schemas.ModuleCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    # Auto-set sequence_index to next value if not specified
    max_seq = db.query(func.max(models.Module.sequence_index)).filter(
        models.Module.department_id == module.department_id
    ).scalar() or 0
    db_module = models.Module(**module.model_dump())
    if db_module.sequence_index == 0:
        db_module.sequence_index = max_seq + 1
    db.add(db_module)
    db.commit()
    db.refresh(db_module)
    return db_module


@app.put("/modules/{module_id}", response_model=schemas.ModuleResponse)
def update_module(
    module_id: str,
    payload: schemas.ModuleUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    db_module = db.query(models.Module).filter(
        models.Module.id == module_id
    ).first()
    if not db_module:
        raise HTTPException(status_code=404, detail="Module not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(db_module, key, value)

    db.commit()
    db.expire(db_module)
    db.refresh(db_module)
    return db_module


@app.put("/modules/{module_id}/reorder")
def reorder_module(
    module_id: str,
    payload: schemas.ReorderRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Swap sequence_index with the adjacent module in the same department."""
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    siblings = db.query(models.Module).filter(
        models.Module.department_id == module.department_id,
        models.Module.is_active == True,  # noqa: E712
    ).order_by(models.Module.sequence_index).all()

    idx = next((i for i, m in enumerate(siblings) if m.id == module_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Module not in siblings list")

    if payload.direction == "up" and idx > 0:
        swap_target = siblings[idx - 1]
    elif payload.direction == "down" and idx < len(siblings) - 1:
        swap_target = siblings[idx + 1]
    else:
        return {"detail": "Already at boundary, no swap performed"}

    # Swap sequence indices
    module.sequence_index, swap_target.sequence_index = (
        swap_target.sequence_index, module.sequence_index
    )
    db.commit()
    return {"detail": "Reorder successful"}


# =====================================================================
#  CONTENT ENDPOINTS
# =====================================================================
@app.post("/content/", response_model=schemas.ContentResponse)
def create_content(
    content: schemas.ContentCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    # Auto-set sequence_index to next value within the module
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
    admin: models.User = Depends(require_admin),
):
    db_content = db.query(models.Content).filter(
        models.Content.id == content_id
    ).first()
    if not db_content:
        raise HTTPException(status_code=404, detail="Content not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_content, key, value)

    db.commit()
    db.refresh(db_content)
    return db_content


@app.put("/content/{content_id}/reorder")
def reorder_content(
    content_id: str,
    payload: schemas.ReorderRequest,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """Swap sequence_index with the adjacent content item in the same module."""
    content = db.query(models.Content).filter(
        models.Content.id == content_id
    ).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    siblings = db.query(models.Content).filter(
        models.Content.module_id == content.module_id,
        models.Content.is_active == True,  # noqa: E712
    ).order_by(models.Content.sequence_index).all()

    idx = next((i for i, c in enumerate(siblings) if c.id == content_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Content not in siblings list")

    if payload.direction == "up" and idx > 0:
        swap_target = siblings[idx - 1]
    elif payload.direction == "down" and idx < len(siblings) - 1:
        swap_target = siblings[idx + 1]
    else:
        return {"detail": "Already at boundary, no swap performed"}

    content.sequence_index, swap_target.sequence_index = (
        swap_target.sequence_index, content.sequence_index
    )
    db.commit()
    return {"detail": "Reorder successful"}


# --- Document File Upload ---
@app.post("/content/upload-document")
def upload_document(
    file: UploadFile = File(...),
    admin: models.User = Depends(require_admin),
):
    """
    Upload a document file (PDF, DOCX, etc.).
    Returns the URL path to be stored in Content.document_url.
    """
    allowed_extensions = {".pdf", ".docx", ".doc", ".pptx", ".xlsx", ".txt", ".md"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(allowed_extensions)}",
        )

    # Generate unique filename to avoid collisions
    safe_name = f"{models.generate_uuid()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return the URL path that the frontend will use
    return {"document_url": f"/uploads/{safe_name}", "original_name": file.filename}


# =====================================================================
#  PROGRESS ENDPOINTS
# =====================================================================
@app.post("/progress/", response_model=schemas.ProgressResponse)
def update_progress(
    progress: schemas.ProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_progress = db.query(models.UserProgress).filter_by(
        user_id=current_user.id, content_id=progress.content_id,
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
    current_user: models.User = Depends(get_current_user),
):
    """Returns all progress records for the authenticated user."""
    return db.query(models.UserProgress).filter(
        models.UserProgress.user_id == current_user.id
    ).all()


# =====================================================================
#  ADMIN REPORTING ENDPOINTS
# =====================================================================
@app.get("/admin/reports/summary", response_model=List[schemas.UserSummaryReport])
def admin_report_summary(
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """
    Summary report: for each active user, count of visible content,
    completed items, and pending items.
    """
    users_query = db.query(models.User).filter(
        models.User.is_active == True,  # noqa: E712
        models.User.role == models.RoleEnum.USER,
    )
    if department_id:
        users_query = users_query.filter(models.User.department_id == department_id)
    users = users_query.all()

    results = []
    for user in users:
        visible_ids = _get_visible_dept_ids(user, db)
        visible_content_count = db.query(func.count(models.Content.id)).join(
            models.Module
        ).filter(
            models.Module.department_id.in_(visible_ids),
            models.Module.is_active == True,  # noqa: E712
            models.Content.is_active == True,  # noqa: E712
        ).scalar()

        completed_count = db.query(func.count(models.UserProgress.id)).filter(
            models.UserProgress.user_id == user.id,
            models.UserProgress.is_completed == True,  # noqa: E712
        ).scalar()

        dept_name = user.department.name if user.department else "Unknown"
        results.append(schemas.UserSummaryReport(
            user_id=user.id,
            full_name=user.full_name,
            department_name=dept_name,
            total_visible=visible_content_count,
            completed=completed_count,
            pending=visible_content_count - completed_count,
        ))

    return results


@app.get(
    "/admin/reports/user/{user_id}",
    response_model=List[schemas.UserDetailedReport],
)
def admin_report_user_detail(
    user_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    """
    Detailed drill-down: for a specific user, list every visible content item
    with its module name, type, and completion status.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    visible_ids = _get_visible_dept_ids(user, db)

    # Get all visible content with their modules
    visible_content = db.query(models.Content, models.Module).join(
        models.Module
    ).filter(
        models.Module.department_id.in_(visible_ids),
        models.Module.is_active == True,  # noqa: E712
        models.Content.is_active == True,  # noqa: E712
    ).order_by(
        models.Module.sequence_index, models.Content.sequence_index
    ).all()

    # Get user's completed content IDs
    progress_map = {}
    for p in db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id
    ).all():
        progress_map[p.content_id] = p

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
