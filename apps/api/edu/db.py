import time

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from edu.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db(retries: int = 15, delay: float = 2.0) -> None:
    from edu import models  # noqa: F401  (register tables)

    for attempt in range(retries):
        try:
            Base.metadata.create_all(engine)
            _migrate(engine)
            return
        except OperationalError:
            if attempt == retries - 1:
                raise
            time.sleep(delay)


def _migrate(engine) -> None:
    """Tiny idempotent migrations (no Alembic yet) — create_all never alters
    existing tables."""
    if engine.dialect.name != "postgresql":
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        # 2026-08-24: grade date + activity deep link on grade items.
        conn.execute(text("ALTER TABLE grade_items ADD COLUMN IF NOT EXISTS graded_at timestamptz"))
        conn.execute(text("ALTER TABLE grade_items ADD COLUMN IF NOT EXISTS url varchar(500)"))


def get_db():
    with SessionLocal() as session:
        yield session
