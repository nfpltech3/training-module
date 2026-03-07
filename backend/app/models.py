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
module_departments = Table(
    'module_departments', Base.metadata,
    Column('module_id', String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True),
    Column('department_id', String, ForeignKey('departments.id', ondelete="CASCADE"), primary_key=True)
)

module_roles = Table(
    'module_roles', Base.metadata,
    Column('module_id', String, ForeignKey('modules.id', ondelete="CASCADE"), primary_key=True),
    Column('role_id', String, ForeignKey('roles.id', ondelete="CASCADE"), primary_key=True)
)

class Role(Base):
    __tablename__ = "roles"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False) # e.g. ADMIN, EMPLOYEE, CLIENT

class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False)

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role_id = Column(String, ForeignKey("roles.id"), nullable=False)
    role = relationship("Role")
    department_id = Column(String, ForeignKey("departments.id"), nullable=True)
    department = relationship("Department")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    module_type = Column(Enum(ModuleTypeEnum), default=ModuleTypeEnum.DEPARTMENT_TRAINING)
    
    # --- UPDATED: Many-to-Many Relationship ---
    departments = relationship("Department", secondary=module_departments, backref="modules")
    roles = relationship("Role", secondary=module_roles, backref="modules")
    
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
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    content_id = Column(String, ForeignKey("content.id"), nullable=False)
    furthest_second_watched = Column(Integer, default=0) 
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)