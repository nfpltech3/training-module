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
    module_type = Column(Enum(ModuleTypeEnum), nullable=True, default=None)
    
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