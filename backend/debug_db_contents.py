
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    res = conn.execute(text("SELECT name FROM roles"))
    roles = [r[0] for r in res]
    print(f"Roles in DB: {roles}")

    res = conn.execute(text("SELECT email FROM users"))
    users = [r[0] for r in res]
    print(f"Users in DB: {users}")
