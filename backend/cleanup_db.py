import sqlite3
import os

db_path = os.path.join(os.getcwd(),'nagarkot.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # 1. DELETE the duplicate admin (seeded local-admin)
    cursor.execute("DELETE FROM users WHERE os_user_id = 'local-root-admin'")
    print(f"Cleanup: Deleted {cursor.rowcount} orphan admin records.")
    
    # 2. Verify remaining users
    rows = cursor.execute('SELECT email, os_user_id, full_name FROM users').fetchall()
    print("\nVerified Users:")
    for r in rows:
        print(f" - {r[0]} | OS ID: {r[1]} | Name: {r[2]}")
    
    conn.commit()
    conn.close()
else:
    print("DB not found at", db_path)
