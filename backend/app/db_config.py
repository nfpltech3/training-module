import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")


def normalize_database_url(raw_url: str) -> str:
    url = raw_url.strip()

    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]

    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]

    return url


def build_database_url_from_parts() -> str | None:
    host = os.getenv("DB_HOST", "").strip()
    port = os.getenv("DB_PORT", "5432").strip()
    name = os.getenv("DB_NAME", "").strip()
    user = os.getenv("DB_USER", "").strip()
    password = os.getenv("DB_PASSWORD", "").strip()

    if not all([host, name, user, password]):
        return None

    return (
        f"postgresql+psycopg://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}"
    )


raw_database_url = os.getenv("DATABASE_URL", "").strip() or build_database_url_from_parts()
if not raw_database_url:
    raise RuntimeError(
        "PostgreSQL configuration is required. Set DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD."
    )


DATABASE_URL = normalize_database_url(raw_database_url)
