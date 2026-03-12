"""
JWT Authentication utilities for the Training App (Spoke).

Password verification is delegated entirely to the Nagarkot OS (Hub).
This module handles local HS256 session tokens and exposes shared helpers
for issuing them via httpOnly cookies.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Response, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from . import models

# --- Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY", "nagarkot-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
COOKIE_NAME = "nagarkot_token"
COOKIE_MAX_AGE_SECONDS = ACCESS_TOKEN_EXPIRE_HOURS * 60 * 60
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"}
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_PATH = "/"

# --- JWT Token ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=COOKIE_MAX_AGE_SECONDS,
        path=COOKIE_PATH,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )

# --- FastAPI Dependency: Extract current user from JWT ---
def get_current_user(
    db: Session = Depends(get_db),
    nagarkot_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = nagarkot_token
    if not token and authorization:
        scheme, _, param = authorization.partition(" ")
        if scheme.lower() == "bearer":
            token = param

    if token is None:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Strict admin only — Super Admin and App Admin. NOT Team Lead."""
    if current_user.role.name.upper() != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


def require_manager(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Admin OR Team Lead — for reports and module creation."""
    if current_user.role.name.upper() not in ["ADMIN", "TEAM LEAD"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Team Lead privileges required"
        )
    return current_user
