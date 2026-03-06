import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime, Enum, Text
from sqlalchemy.orm import relationship
from .database import Base


def generate_uuid():
    return str(uuid.uuid4())


class RoleEnum(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class ContentTypeEnum(str, enum.Enum):
    VIDEO = "VIDEO"
    DOCUMENT = "DOCUMENT"


class Department(Base):
    __tablename__ = "departments"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False)
    is_global = Column(Boolean, default=False)
    # When is_global=True, ALL users see content from this department
    # regardless of their own department assignment.


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.USER)
    department_id = Column(String, ForeignKey("departments.id"), nullable=False)
    department = relationship("Department")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Module(Base):
    """A logical grouping of content items (e.g., 'Incoterms', 'Safety Protocol')."""
    __tablename__ = "modules"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    department_id = Column(String, ForeignKey("departments.id"), nullable=False)
    department = relationship("Department")
    sequence_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship: Module has many Content items
    content_items = relationship(
        "Content", back_populates="module",
        order_by="Content.sequence_index"
    )


class Content(Base):
    """A single content item: a video or a document."""
    __tablename__ = "content"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content_type = Column(Enum(ContentTypeEnum), nullable=False)
    embed_url = Column(String, nullable=True)       # YouTube URL for VIDEO type
    document_url = Column(String, nullable=True)     # Served file path for DOCUMENT type
    module_id = Column(String, ForeignKey("modules.id"), nullable=False)
    module = relationship("Module", back_populates="content_items")
    sequence_index = Column(Integer, default=0)
    total_duration = Column(Integer, nullable=True)  # Seconds (for videos)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserProgress(Base):
    __tablename__ = "user_progress"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    content_id = Column(String, ForeignKey("content.id"), nullable=False)
    furthest_second_watched = Column(Integer, default=0)  # Videos only
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
