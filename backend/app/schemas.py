from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import ModuleTypeEnum, ContentTypeEnum


# --- Auth Schemas ---
class LoginRequest(BaseModel):
    identifier: str    # email or username
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


# --- Role Schemas ---
class RoleResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True


# --- Department Schemas ---
class DepartmentBase(BaseModel):
    name: str

class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None


class DepartmentResponse(DepartmentBase):
    id: str

    class Config:
        from_attributes = True


# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    username: Optional[str] = None
    full_name: str
    department_id: Optional[str] = None
    role_id: str


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    department_id: Optional[str] = None
    role_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role_id: str
    role: Optional[RoleResponse] = None
    department_id: Optional[str] = None
    department: Optional[DepartmentResponse] = None
    is_active: bool
    created_at: datetime
    os_user_id: Optional[str] = None
    department_slug: Optional[str] = None
    is_app_admin: bool = False

    class Config:
        from_attributes = True


# --- Content Schemas (defined before Module so ModuleResponse can reference it) ---
class ContentBase(BaseModel):
    title: str
    description: Optional[str] = None
    content_type: ContentTypeEnum
    embed_url: Optional[str] = None
    document_url: Optional[str] = None
    module_id: str
    sequence_index: int = 0
    total_duration: Optional[int] = None


class ContentCreate(ContentBase):
    pass


class ContentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[ContentTypeEnum] = None
    embed_url: Optional[str] = None
    document_url: Optional[str] = None
    module_id: Optional[str] = None
    sequence_index: Optional[int] = None
    total_duration: Optional[int] = None
    is_active: Optional[bool] = None


class ContentResponse(ContentBase):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Module Schemas ---
class ModuleBase(BaseModel):
    title: str
    description: Optional[str] = None
    module_type: ModuleTypeEnum = ModuleTypeEnum.DEPARTMENT_TRAINING
    department_ids: List[str] = []
    role_ids: List[str] = []
    sequence_index: int = 0

class ModuleCreate(ModuleBase):
    pass

class ModuleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    module_type: Optional[ModuleTypeEnum] = None
    department_ids: Optional[List[str]] = None
    role_ids: Optional[List[str]] = None
    sequence_index: Optional[int] = None
    is_active: Optional[bool] = None

class ModuleResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    module_type: ModuleTypeEnum
    sequence_index: int
    departments: List[DepartmentResponse] = []
    roles: List[RoleResponse] = []
    is_active: bool
    created_at: datetime
    content_items: List['ContentResponse'] = []

    class Config:
        from_attributes = True


# --- Progress Schemas ---
class ProgressUpdate(BaseModel):
    content_id: str
    furthest_second_watched: int = 0
    is_completed: bool = False


class ProgressResponse(BaseModel):
    id: str
    content_id: str
    furthest_second_watched: int
    is_completed: bool
    completed_at: Optional[datetime] = None
    last_accessed_at: datetime

    class Config:
        from_attributes = True


# --- Reorder Schema ---
class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


# --- Admin Reporting Schemas ---
class UserSummaryReport(BaseModel):
    user_id: str
    full_name: str
    department_name: str
    total_visible: int
    completed: int
    pending: int


class UserDetailedReport(BaseModel):
    user_id: str
    full_name: str
    module_title: str
    content_title: str
    content_type: ContentTypeEnum
    is_completed: bool
    completed_at: Optional[datetime] = None


# Forward ref resolution for self-referencing schemas
TokenResponse.model_rebuild()
