"""One-time migration: add os_user_id column and create sso_token_log table."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "nagarkot.db")

if not os.path.exists(db_path):
    print("nagarkot.db not found — column will be created on first server startup.")
else:
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Add os_user_id to users (ignore error if column already exists)
    try:
        cur.execute("ALTER TABLE users ADD COLUMN os_user_id VARCHAR")
        print("Added os_user_id column to users table.")
    except sqlite3.OperationalError as e:
        print(f"os_user_id: {e}")

    # Partial unique index — supported in SQLite 3.8.9+
    try:
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_os_user_id "
            "ON users(os_user_id) WHERE os_user_id IS NOT NULL"
        )
        print("Created unique index on os_user_id.")
    except sqlite3.OperationalError as e:
        print(f"Index: {e}")

    con.commit()
    con.close()
    print("Migration complete.")
