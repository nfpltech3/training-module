import sqlite3

conn = sqlite3.connect("nagarkot.db")
cur = conn.cursor()

cur.executescript("""
PRAGMA foreign_keys = OFF;

CREATE TABLE user_progress_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    furthest_second_watched INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT 0,
    completed_at DATETIME,
    last_accessed_at DATETIME
);

INSERT INTO user_progress_new SELECT * FROM user_progress;

DROP TABLE user_progress;

ALTER TABLE user_progress_new RENAME TO user_progress;

PRAGMA foreign_keys = ON;
""")

conn.commit()
cur.execute("SELECT sql FROM sqlite_master WHERE name='user_progress'")
print(cur.fetchone()[0])
conn.close()
print("Migration complete.")
