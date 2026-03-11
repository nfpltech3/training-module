from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import ModuleTypeEnum, ContentTypeEnum


# --- Auth Schemas ---
class LoginRequest(BaseModel):
    identifier: str    # email
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


# --- User Schemas ---
class AdminUserUpdate(BaseModel):
    # Training Admins can only edit these two fields now
    role_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    os_user_id: str
    email: EmailStr
    full_name: str
    department_slug: Optional[str] = None
    org_id: Optional[str] = None
    is_app_admin: bool
    role_id: str
    role: Optional[RoleResponse] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Content Schemas ---
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
    module_type: Optional[ModuleTypeEnum] = None
    department_slugs: List[str] = []
    org_ids: List[str] = []
    role_ids: List[str] = []
    sequence_index: int = 0

class ModuleCreate(ModuleBase):
    pass

class ModuleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    module_type: Optional[ModuleTypeEnum] = None
    department_slugs: Optional[List[str]] = None
    org_ids: Optional[List[str]] = None
    role_ids: Optional[List[str]] = None
    sequence_index: Optional[int] = None
    is_active: Optional[bool] = None

class ModuleResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    module_type: Optional[ModuleTypeEnum] = None
    sequence_index: int
    department_slugs: List[str] = []
    org_ids: List[str] = []
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


# --- Reorder / Move Schemas ---
class ReorderRequest(BaseModel):
    direction: str  # "up" or "down"


class MoveRequest(BaseModel):
    new_index: int


# --- Admin Reporting Schemas ---
class UserSummaryReport(BaseModel):
    user_id: str
    full_name: str
    department_slug: Optional[str] = None
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