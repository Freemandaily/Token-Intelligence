from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Point directly to the DuckDB file created by dbt
    duckdb_path: str = "/app/data/analytics.duckdb" #"/home/freeman/Decode-Series/token_intelligence/data/analytics.duckdb"
    
    top_holders_limit: int = 1000
    min_balance_pct: float = 0.0001

    @property
    def database_url(self) -> str:
        # SQLAlchemy requires 4 slashes for an absolute path (duckdb:////path/to/db)
        return f"duckdb:///{self.duckdb_path}"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
