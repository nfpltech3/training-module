import os
from sqlalchemy import create_engine, text
from sqlalchemy.engine import url as sa_url
from dotenv import load_dotenv
from pathlib import Path

# Load env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("DATABASE_URL not found")
    exit(1)

parsed = sa_url.make_url(db_url)
print(f"Connecting to: {parsed.host}:{parsed.port}/{parsed.database} as {parsed.username}")

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

run_query("SELECT typname, nspname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE typname LIKE '%moduletype%' OR typname LIKE '%contenttype%'", "GLOBAL SEARCH FOR TYPES")
run_query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'", "PUBLIC TABLES")
