
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    res = conn.execute(text("SELECT * FROM users"))
    cols = res.keys()
    for row in res:
        print(dict(zip(cols, row)))
