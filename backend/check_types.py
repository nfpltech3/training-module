import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pathlib import Path

# Load env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("DATABASE_URL not found")
    exit(1)

engine = create_engine(db_url)

def run_query(query, title):
    print(f"--- {title} ---")
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            for row in rows:
                print(row)
    except Exception as e:
        print(f"Error: {e}")
    print("\n")

run_query("SELECT typname FROM pg_type WHERE typname IN ('moduletypeenum', 'contenttypeenum')", "SPECIFIC TYPES")
run_query("SELECT * FROM pg_enum", "ENUM VALUES")
