import sqlite3

conn = sqlite3.connect('nagarkot.db')
c = conn.cursor()
c.execute("SELECT id, name FROM roles")
roles = c.fetchall()
print('Roles:', roles)

# Let's see if there are users with TEAM_LEAD role (where name is TEAM_LEAD)
c.execute("SELECT id, name FROM roles WHERE name='TEAM_LEAD'")
old_team_lead = c.fetchone()
c.execute("SELECT id, name FROM roles WHERE name='TEAM LEAD'")
new_team_lead = c.fetchone()

if old_team_lead and new_team_lead:
    c.execute("UPDATE users SET role_id=? WHERE role_id=?", (new_team_lead[0], old_team_lead[0]))
    c.execute("UPDATE module_roles SET role_id=? WHERE role_id=?", (new_team_lead[0], old_team_lead[0]))
    c.execute("DELETE FROM roles WHERE id=?", (old_team_lead[0],))
    conn.commit()
    print('Migrated users and modules to new TEAM LEAD role and deleted old TEAM_LEAD role.')

conn.close()
