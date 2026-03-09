import sqlite3
con = sqlite3.connect("nagarkot.db")
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
print([r[0] for r in cur.fetchall()])
con.close()
