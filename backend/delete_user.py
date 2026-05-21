"""
delete_user.py - Directly delete an orphaned user from the Trainings PostgreSQL DB.

Usage:
  Dry-run first (safe preview, no deletion):
    python delete_user.py --email "someone@example.com" --dry-run

  Then actually delete:
    python delete_user.py --email "someone@example.com"

  Or target by Training DB UUID instead of email:
    python delete_user.py --id "some-uuid-here"

Run from inside the backend/ directory with the venv activated:
  venv\\Scripts\\activate ; python delete_user.py --email "someone@example.com"

How DB targeting works (no manual URL needed):
  - LOCAL: run normally. The script reads DATABASE_URL from backend/.env.
  - PRODUCTION: run on the production server. DATABASE_URL is already set
    in the server environment, so .env is ignored automatically.
"""

import argparse
import sys
from pathlib import Path

# Load .env only if DATABASE_URL is not already set in the environment.
# On the production server it is already set, so this is a no-op there.
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db_config import DATABASE_URL
from app.models import User, UserProgress

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Show which DB we are connected to (host only, no password)
try:
    from urllib.parse import urlparse
    _host = urlparse(DATABASE_URL.replace("+psycopg", "")).hostname or "unknown"
except Exception:
    _host = "unknown"
print(f"[INFO] Connected to: {_host}")


def find_user(db, *, email: str = None, user_id: str = None):
    if email:
        return db.query(User).filter(User.email == email).first()
    if user_id:
        return db.query(User).filter(User.id == user_id).first()
    return None


def main():
    parser = argparse.ArgumentParser(description="Delete an orphaned user from the Trainings DB.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--email", help="Email address of the user to delete")
    group.add_argument("--id", dest="user_id", help="Training DB user UUID")
    parser.add_argument("--dry-run", action="store_true", help="Preview without deleting")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = find_user(db, email=args.email, user_id=args.user_id)

        if not user:
            print(f"[ERROR] No user found for {'email=' + args.email if args.email else 'id=' + args.user_id}")
            sys.exit(1)

        progress_count = db.query(UserProgress).filter(UserProgress.user_id == user.id).count()

        print(f"\n{'[DRY RUN] ' if args.dry_run else ''}User to delete:")
        print(f"  Training ID   : {user.id}")
        print(f"  OS User ID    : {user.os_user_id}")
        print(f"  Email         : {user.email}")
        print(f"  Full Name     : {user.full_name}")
        print(f"  Department    : {user.department_slug or '(none)'}")
        print(f"  Status        : {user.status}")
        print(f"  Progress rows : {progress_count} (will be CASCADE-deleted)\n")

        if args.dry_run:
            print("[OK] Dry-run complete. No changes made.")
            return

        # Require typing the email to confirm — prevents accidental deletes
        confirm = input(f"Type the email to confirm deletion [{user.email}]: ").strip()
        if confirm != user.email:
            print("[ABORT] Email did not match. Aborting.")
            sys.exit(1)

        db.delete(user)
        db.commit()
        print(f"\n[DELETED] User '{user.email}' (id={user.id}) and {progress_count} progress row(s) deleted successfully.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
