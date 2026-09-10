from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    parquet_root: str = str(Path(__file__).resolve().parents[2] / "Data" / "parquet")
    duckdb_path: str = str(Path(__file__).resolve().parent.parent / "backend_v2.duckdb")
    top_holders_limit: int = 1000
    min_balance_pct: float = 0.0001
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
