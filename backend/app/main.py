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
        # 1. Seed Roles
        default_roles = ["ADMIN", "EMPLOYEE", "CLIENT"]
        for role_name in default_roles:
            if not db.query(models.Role).filter(func.lower(models.Role.name) == role_name.lower()).first():
                db.add(models.Role(name=role_name))
        db.commit()

        # 2. Seed ACTUAL Departments Only
        default_depts = [
            {"name": "Freight Forwarding"},
            {"name": "Accounts"},
            {"name": "Tech"},
            {"name": "Documentation"},
        ]
        for dept_data in default_depts:
            if not db.query(models.Department).filter(models.Department.name == dept_data["name"]).first():
                db.add(models.Department(**dept_data))
        db.commit()

        # 3. Seed Admin (Admins no longer need a department!)
        admin_role = db.query(models.Role).filter(models.Role.name == "ADMIN").first()
        admin = db.query(models.User).filter(models.User.email == "admin@nagarkot.com").first()
        
        if not admin and admin_role:
            db.add(models.User(
                email="admin@nagarkot.com",
                username="admin",
                password_hash=hash_password("admin123"),
                full_name="Super Administrator",
                department_id=None, # Clean null department for Admins
                role_id=admin_role.id,
            ))
            db.commit()
    finally:
        db.close()


# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Nagarkot Knowledge Platform API v2 is running"}


# =====================================================================
#  AUTH & DEPARTMENTS & USERS
# =====================================================================
@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    identifier = payload.identifier.lower().strip()
    user = db.query(models.User).filter(
        (func.lower(models.User.email) == identifier) |
        (func.lower(models.User.username) == identifier)
    ).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token(data={"sub": user.id})
    return schemas.TokenResponse(
        access_token=token,
        user=schemas.UserResponse.model_validate(user),
    )


@app.get("/departments/", response_model=List[schemas.DepartmentResponse])
def get_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).all()


@app.post("/departments/", response_model=schemas.DepartmentResponse)
def create_department(dept: schemas.DepartmentCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    existing = db.query(models.Department).filter(models.Department.name == dept.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department exists")
    db_dept = models.Department(**dept.model_dump())
    db.add(db_dept)
    db.commit()
    db.refresh(db_dept)
    return db_dept


@app.put("/departments/{dept_id}", response_model=schemas.DepartmentResponse)
def update_department(dept_id: str, payload: schemas.DepartmentUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="Department not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_dept, key, value)
    db.commit()
    db.refresh(db_dept)
    return db_dept


@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_user = models.User(
        email=user.email,
        username=user.username or user.email,
        password_hash=hash_password(user.password),
        full_name=user.full_name,
        department_id=user.department_id,
        role_id=user.role_id,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.get("/users/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.put("/users/me", response_model=schemas.UserResponse)
def update_me(payload: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if payload.username is not None:
        if db.query(models.User).filter(models.User.username == payload.username, models.User.id != current_user.id).first():
            raise HTTPException(status_code=400, detail="Username taken")
        current_user.username = payload.username
    if payload.password is not None:
        current_user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(current_user)
    return current_user


@app.get("/users/", response_model=List[schemas.UserResponse])
def get_users(db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    return db.query(models.User).all()


@app.put("/admin/users/{user_id}", response_model=schemas.UserResponse)
def admin_update_user(user_id: str, payload: schemas.AdminUserUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "password" in update_data:
        if update_data["password"]:
            db_user.password_hash = hash_password(update_data["password"])
        del update_data["password"]
    if "email" in update_data and update_data["email"]:
        if db.query(models.User).filter(models.User.email == update_data["email"], models.User.id != user_id).first():
            raise HTTPException(status_code=400, detail="Email taken")
        db_user.email = update_data["email"]
    update_data.pop("email", None)

    for key, value in update_data.items():
        if value is not None:
            setattr(db_user, key, value)
    db.commit()
    db.refresh(db_user)
    return db_user


# =====================================================================
#  ROLES
# =====================================================================
@app.get("/roles/", response_model=List[schemas.RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    return db.query(models.Role).all()


# =====================================================================
#  MODULE ENDPOINTS (Many-to-Many Updated)
# =====================================================================

@app.get("/modules/", response_model=List[schemas.ModuleResponse])
def get_modules(department_id: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Module).options(
        joinedload(models.Module.departments),
        joinedload(models.Module.roles),
        joinedload(models.Module.content_items),
    ).filter(models.Module.is_active == True)

    user_role_name = current_user.role.name.upper()

    if user_role_name == "ADMIN":
        if department_id:
            query = query.filter(models.Module.departments.any(models.Department.id == department_id))
    elif user_role_name == "CLIENT":
        query = query.filter(models.Module.roles.any(models.Role.name.ilike("CLIENT")))
    else:
        # The New Zero-Department Rule:
        # User sees it IF it's an Employee role AND (It has NO departments OR it matches their department)
        query = query.filter(
            models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
            ( ~models.Module.departments.any() | models.Module.departments.any(models.Department.id == current_user.department_id) )
        )

    return query.order_by(models.Module.sequence_index).all()


@app.post("/modules/", response_model=schemas.ModuleResponse)
def create_module(module: schemas.ModuleCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    depts = db.query(models.Department).filter(models.Department.id.in_(module.department_ids)).all()
    roles = db.query(models.Role).filter(models.Role.id.in_(module.role_ids)).all()
    max_seq = db.query(func.max(models.Module.sequence_index)).scalar() or 0
    
    db_module = models.Module(
        title=module.title,
        description=module.description,
        module_type=module.module_type,
        sequence_index=module.sequence_index if module.sequence_index else max_seq + 1
    )
    db_module.departments = depts
    db_module.roles = roles
    db.add(db_module)
    db.commit()
    db.refresh(db_module)
    return db_module


@app.put("/modules/{module_id}", response_model=schemas.ModuleResponse)
def update_module(module_id: str, payload: schemas.ModuleUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not db_module:
        raise HTTPException(status_code=404, detail="Module not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "department_ids" in update_data:
        dept_ids = update_data.pop("department_ids")
        if dept_ids is not None:
            db_module.departments = db.query(models.Department).filter(models.Department.id.in_(dept_ids)).all()

    if "role_ids" in update_data:
        role_ids = update_data.pop("role_ids")
        if role_ids is not None:
            db_module.roles = db.query(models.Role).filter(models.Role.id.in_(role_ids)).all()

    for key, value in update_data.items():
        if value is not None:
            setattr(db_module, key, value)

    db.commit()
    db.refresh(db_module)
    return db_module


@app.put("/modules/{module_id}/reorder")
def reorder_module(module_id: str, payload: schemas.ReorderRequest, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    module = db.query(models.Module).filter(models.Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    siblings = db.query(models.Module).filter(models.Module.is_active == True).order_by(models.Module.sequence_index).all()
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


# =====================================================================
#  CONTENT & PROGRESS & REPORTS
# =====================================================================
@app.post("/content/", response_model=schemas.ContentResponse)
def create_content(content: schemas.ContentCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    max_seq = db.query(func.max(models.Content.sequence_index)).filter(models.Content.module_id == content.module_id).scalar() or 0
    db_content = models.Content(**content.model_dump())
    if db_content.sequence_index == 0:
        db_content.sequence_index = max_seq + 1
    db.add(db_content)
    db.commit()
    db.refresh(db_content)
    return db_content


@app.put("/content/{content_id}", response_model=schemas.ContentResponse)
def update_content(content_id: str, payload: schemas.ContentUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    db_content = db.query(models.Content).filter(models.Content.id == content_id).first()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_content, key, value)
    db.commit()
    db.refresh(db_content)
    return db_content


@app.put("/content/{content_id}/reorder")
def reorder_content(content_id: str, payload: schemas.ReorderRequest, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    content = db.query(models.Content).filter(models.Content.id == content_id).first()
    siblings = db.query(models.Content).filter(models.Content.module_id == content.module_id, models.Content.is_active == True).order_by(models.Content.sequence_index).all()
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


@app.post("/content/upload-document")
def upload_document(file: UploadFile = File(...), admin: models.User = Depends(require_admin)):
    ext = os.path.splitext(file.filename)[1].lower()
    safe_name = f"{models.generate_uuid()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"document_url": f"/uploads/{safe_name}", "original_name": file.filename}


@app.post("/progress/", response_model=schemas.ProgressResponse)
def update_progress(progress: schemas.ProgressUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_progress = db.query(models.UserProgress).filter_by(user_id=current_user.id, content_id=progress.content_id).first()
    if not db_progress:
        db_progress = models.UserProgress(
            user_id=current_user.id, content_id=progress.content_id,
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
def get_my_progress(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.UserProgress).filter(models.UserProgress.user_id == current_user.id).all()


@app.get("/admin/reports/summary", response_model=List[schemas.UserSummaryReport])
def admin_report_summary(department_id: Optional[str] = None, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    users_query = db.query(models.User).filter(models.User.is_active == True, models.User.role.has(models.Role.name == "EMPLOYEE"))
    if department_id:
        users_query = users_query.filter(models.User.department_id == department_id)
    
    results = []
    for user in users_query.all():
        visible_content_count = db.query(func.count(models.Content.id)).join(models.Module).filter(
            models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
            ( ~models.Module.departments.any() | models.Module.departments.any(models.Department.id == user.department_id) ),
            models.Module.is_active == True, models.Content.is_active == True
        ).scalar()
        
        completed_count = db.query(func.count(models.UserProgress.id)).filter(
            models.UserProgress.user_id == user.id, models.UserProgress.is_completed == True
        ).scalar()

        results.append(schemas.UserSummaryReport(
            user_id=user.id, full_name=user.full_name, department_name=user.department.name if user.department else "Unknown",
            total_visible=visible_content_count, completed=completed_count, pending=visible_content_count - completed_count,
        ))
    return results


@app.get("/admin/reports/user/{user_id}", response_model=List[schemas.UserDetailedReport])
def admin_report_user_detail(user_id: str, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")

    visible_content = db.query(models.Content, models.Module).join(models.Module).filter(
        models.Module.roles.any(models.Role.name.ilike("EMPLOYEE")),
        ( ~models.Module.departments.any() | models.Module.departments.any(models.Department.id == user.department_id) ),
        models.Module.is_active == True, models.Content.is_active == True
    ).order_by(models.Module.sequence_index, models.Content.sequence_index).all()

    progress_map = {p.content_id: p for p in db.query(models.UserProgress).filter(models.UserProgress.user_id == user_id).all()}

    results = []
    for content, module in visible_content:
        prog = progress_map.get(content.id)
        results.append(schemas.UserDetailedReport(
            user_id=user.id, full_name=user.full_name, module_title=module.title,
            content_title=content.title, content_type=content.content_type,
            is_completed=prog.is_completed if prog else False,
            completed_at=prog.completed_at if prog and prog.is_completed else None,
        ))
    return results