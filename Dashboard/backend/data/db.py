from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_connection():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("DuckDB connected")
    except Exception as e:
        print(f" DuckDB connection failed: {e}")
        raise
