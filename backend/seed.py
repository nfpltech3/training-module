import os

import httpx
from sqlalchemy import func

from app.database import SessionLocal
from app import models


OS_BACKEND_URL = os.getenv("OS_BACKEND_URL", "http://localhost:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


DEFAULT_ROLES = ["ADMIN", "MANAGER", "TEAM LEAD", "EMPLOYEE", "CLIENT"]


def seed_roles(db) -> None:
    created = 0
    for role_name in DEFAULT_ROLES:
        existing = db.query(models.Role).filter(
            func.lower(models.Role.name) == role_name.lower()
        ).first()
        if existing:
            continue
        db.add(models.Role(name=role_name))
        created += 1

    db.commit()
    print(f"[seed] roles ready ({created} created)")


def sync_departments(db) -> None:
    if not INTERNAL_API_KEY:
        print("[seed] skipping department sync: INTERNAL_API_KEY is not configured")
        return

    try:
        res = httpx.get(
            f"{OS_BACKEND_URL}/users/internal/departments",
            headers={"x-internal-key": INTERNAL_API_KEY},
            timeout=10.0,
        )
        res.raise_for_status()
    except httpx.HTTPError as exc:
        print(f"[seed] skipping department sync: {exc}")
        return

    created = 0
    updated = 0
    for item in res.json():
        dept = db.query(models.Department).filter(
            models.Department.os_department_id == item["id"]
        ).first()

        if dept:
            dept.slug = item["slug"]
            dept.name = item["name"]
            dept.status = "active"
            updated += 1
            continue

        db.add(
            models.Department(
                os_department_id=item["id"],
                slug=item["slug"],
                name=item["name"],
                status="active",
            )
        )
        created += 1

    db.commit()
    print(f"[seed] departments ready ({created} created, {updated} updated)")


def main() -> None:
    db = SessionLocal()
    try:
        seed_roles(db)
        sync_departments(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
