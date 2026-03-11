import os
import sqlite3

def run_migration():
    db_path = os.path.join(os.path.dirname(__file__), "app", "nagarkot.db")
    if not os.path.exists(db_path):
        db_path = os.path.join(os.path.dirname(__file__), "nagarkot.db")
        if not os.path.exists(db_path):
            print("Could not find the SQLite database 'training.db'")
            return
            
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if MANAGER role exists
    cursor.execute("SELECT id FROM roles WHERE LOWER(name) = 'manager'")
    manager_role = cursor.fetchone()
    if not manager_role:
        print("MANAGER role not found in 'roles' table. Did you start the app to seed it?")
        # Just in case, let's create it.
        cursor.execute("INSERT INTO roles (id, name) VALUES (lower(hex(randomblob(16))), 'MANAGER')")
        cursor.execute("SELECT id FROM roles WHERE LOWER(name) = 'manager'")
        manager_role = cursor.fetchone()
        
    manager_role_id = manager_role[0]
    
    # Get ADMIN role ID
    cursor.execute("SELECT id FROM roles WHERE LOWER(name) = 'admin'")
    admin_role = cursor.fetchone()
    if not admin_role:
        print("ADMIN role not found. Nothing to migrate.")
        return
        
    admin_role_id = admin_role[0]
    
    try:
        cursor.execute(
            "UPDATE module_roles SET role_id = ? WHERE role_id = ?",
            (manager_role_id, admin_role_id)
        )
        rowcount = cursor.rowcount
    except sqlite3.IntegrityError:
        # If it fails due to UNIQUE constraint, do it one by one
        cursor.execute("SELECT module_id FROM module_roles WHERE role_id = ?", (admin_role_id,))
        for row in cursor.fetchall():
            mod_id = row[0]
            cursor.execute("INSERT OR IGNORE INTO module_roles (module_id, role_id) VALUES (?, ?)", (mod_id, manager_role_id))
            cursor.execute("DELETE FROM module_roles WHERE module_id = ? AND role_id = ?", (mod_id, admin_role_id))
        rowcount = "multiple (with constraint resolution)"
    
    conn.commit()
    conn.close()
    
    print(f"Migration completed successfully. Updated {rowcount} module role assignments from ADMIN to MANAGER.")

if __name__ == "__main__":
    run_migration()
