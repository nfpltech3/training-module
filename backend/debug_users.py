import sqlite3
conn = sqlite3.connect('nagarkot.db')
cursor = conn.cursor()
rows = cursor.execute('SELECT id, os_user_id, email, full_name, department_slug FROM users').fetchall()
print("ID | OS_USER_ID | EMAIL | NAME | DEPT")
for r in rows:
    print(f"{r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]}")
conn.close()
