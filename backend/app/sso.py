"""
SSO Consumer for Trainings.

Verifies a short-lived RS256 token issued by Nagarkot OS,
then issues a standard Trainings HS256 JWT so the rest of
the app works exactly as before.
"""

import os
from datetime import datetime
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db
from . import models
from .auth import create_access_token

# Load backend/.env regardless of where uvicorn is launched from
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

router = APIRouter()

# ─── Load OS public key ───────────────────────────────────────────
OS_JWT_PUBLIC_KEY = os.getenv("OS_JWT_PUBLIC_KEY", "").replace("\\n", "\n")
OS_BACKEND_URL = os.getenv("OS_BACKEND_URL", "http://localhost:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


class SsoRequest(BaseModel):
    token: str


class SsoResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/sso", response_model=SsoResponse)
def sso_login(body: SsoRequest, db: Session = Depends(get_db)):
    """
    Called by the Trainings frontend after OS redirects with SSO token.
    Validates the token, finds or creates a local user, returns a
    standard Trainings JWT.
    """

    if not OS_JWT_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SSO not configured on this server",
        )

    # ── 1. Verify RS256 signature and expiry ──────────────────────
    try:
        payload = jwt.decode(
            body.token,
            OS_JWT_PUBLIC_KEY,
            algorithms=["RS256"],
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired SSO token: {str(e)}",
        )

    token_id: Optional[str] = payload.get("token_id")
    os_user_id: Optional[str] = payload.get("user_id")
    email: Optional[str] = payload.get("email")
    name: Optional[str] = payload.get("name")
    user_type: Optional[str] = payload.get("user_type")  # 'employee' or 'client'

    # New fields from updated OS SSO payload
    department_slug: Optional[str] = payload.get("department_slug")
    is_app_admin: bool = payload.get("is_app_admin", False)

    if not all([token_id, os_user_id, email]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="SSO token payload is incomplete",
        )

    # ── 2. Check token has not been used already (replay attack) ──
    existing_log = (
        db.query(models.SsoTokenLog)
        .filter(models.SsoTokenLog.token_id == token_id)
        .first()
    )
    if existing_log:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="SSO token has already been used",
        )

    # ── 3. Mark token as consumed immediately ─────────────────────
    try:
        db.add(
            models.SsoTokenLog(
                token_id=token_id,
                used=True,
                consumed_at=datetime.utcnow(),
                app_slug="trainings",
            )
        )
        db.commit()
    except Exception:
        # Another request inserted the same token_id concurrently (race condition)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="SSO token has already been used",
        )

    # ── 3b. Verify user is still active in OS ─────────────────────
    try:
        check = httpx.post(
            f"{OS_BACKEND_URL}/auth/verify-session",
            json={"os_user_id": os_user_id},
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=5.0,
        )
        if check.status_code == 200 and not check.json().get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact your administrator.",
            )
    except httpx.RequestError:
        # OS unreachable — fail open, log warning
        print(f"WARNING: Could not reach OS to verify user {os_user_id} — proceeding")

    # ── 4. Find or create local Trainings user ────────────────────
    user = (
        db.query(models.User)
        .filter(models.User.os_user_id == os_user_id)
        .first()
    )

    if not user:
        # Try to match by email (for users who existed before SSO)
        user = (
            db.query(models.User)
            .filter(models.User.email == email)
            .first()
        )

    if user:
        # Sync identity fields from OS on every login
        user.full_name = name or user.full_name
        user.email = email or user.email
        user.department_slug = department_slug
        user.is_app_admin = is_app_admin
        if user.os_user_id is None:
            user.os_user_id = os_user_id

        # Sync role — is_app_admin is authoritative for ADMIN,
        # user_type distinguishes EMPLOYEE vs CLIENT for everyone else
        if is_app_admin:
            target_role_name = "ADMIN"
        elif user_type == "client":
            target_role_name = "CLIENT"
        else:
            target_role_name = "EMPLOYEE"
        target_role = db.query(models.Role).filter(
            models.Role.name == target_role_name
        ).first()
        if target_role:
            user.role_id = target_role.id

        db.commit()

    if not user:
        # First time this person logs into Trainings via SSO
        # Assign role: is_app_admin is authoritative for ADMIN,
        # user_type distinguishes EMPLOYEE vs CLIENT for everyone else
        if is_app_admin:
            role_name = "ADMIN"
        elif user_type == "client":
            role_name = "CLIENT"
        else:
            role_name = "EMPLOYEE"
        role = db.query(models.Role).filter(
            models.Role.name == role_name
        ).first()

        if not role:
            # Fallback to first available role
            role = db.query(models.Role).first()

        if not role:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No roles found in Trainings database. Run the Trainings seed first.",
            )

        user = models.User(
            email=email,
            username=email.split("@")[0],  # simple default username
            password_hash="SSO_USER_NO_PASSWORD",  # SSO users never use password
            full_name=name or email,
            role_id=role.id,
            is_active=True,
            os_user_id=os_user_id,
            department_slug=department_slug,
            is_app_admin=is_app_admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated",
        )

    # ── 5. Issue standard Trainings HS256 JWT ─────────────────────
    # Same format as existing login — rest of app works unchanged
    trainings_token = create_access_token(data={"sub": user.id})

    return SsoResponse(
        access_token=trainings_token,
        token_type="bearer",
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": {"name": user.role.name} if user.role else None,
            "is_app_admin": user.is_app_admin,
            "department_slug": user.department_slug,
        },
    )
