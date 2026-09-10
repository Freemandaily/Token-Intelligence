from __future__ import annotations
import duckdb
from pathlib import Path
from core.config import get_settings

settings = get_settings()
PARQUET_ROOT = Path(settings.parquet_root)
TRANSFERS_CHAINS = ["ethereum", "base", "arbitrum", "optimism", "bsc"]
METADATA_FILE = PARQUET_ROOT / "token_metadata.parquet"
TRANSFERS_FILES = {chain: PARQUET_ROOT / f"transfers_{chain}.parquet" for chain in TRANSFERS_CHAINS}

class DuckDBStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or Path(settings.duckdb_path)
        self.con = duckdb.connect(str(self.db_path))
        self._attach_parquet()

    def _attach_parquet(self) -> None:
        self._ready = False
        if not PARQUET_ROOT.exists():
            print(f"WARN: Parquet root not found: {PARQUET_ROOT} - running in degraded mode (no data)")
            return
        self.con.execute("CREATE SCHEMA IF NOT EXISTS analytics_staging")
        self.con.execute("CREATE SCHEMA IF NOT EXISTS analytics_fact")
        try:
            self._create_metadata_view()
            self._create_transfers_views()
            self._ready = True
        except FileNotFoundError as e:
            print(f"WARN: {e} - running in degraded mode")
            return

    def _create_metadata_view(self) -> None:
        if not METADATA_FILE.exists():
            print(f"WARN: Token metadata parquet not found: {METADATA_FILE} - skipping metadata view")
            return
        path_str = METADATA_FILE.as_posix().replace("'", "''")
        self.con.execute(f"""
            CREATE OR REPLACE VIEW analytics_staging.token_metadata AS
            SELECT lower(token_address) AS token_address, name, symbol, decimals, total_supply, supply_source, logo_url, chain
            FROM read_parquet('{path_str}')
        """)

    def _create_transfers_views(self) -> None:
        for chain, path in TRANSFERS_FILES.items():
            if not path.exists():
                print(f"WARN: Transfers parquet not found for chain {chain}: {path} - skipping")
                continue
            path_str = path.as_posix().replace("'", "''")
            view_name = f"analytics_fact.token_transfers_{chain}"
            self.con.execute(f"""
                CREATE OR REPLACE VIEW {view_name} AS
                SELECT id, tx_hash, lower(from_address) AS from_address, lower(to_address) AS to_address,
                       cast(amount AS DOUBLE) AS amount, lower(token_address) AS token_address,
                       block_timestamp, block_number, token_total_supply,
                       cast(from_address_name AS VARCHAR) AS from_address_name,
                       cast(to_address_name AS VARCHAR) AS to_address_name
                FROM read_parquet('{path_str}')
            """)

    def test_connection(self) -> bool:
        if not PARQUET_ROOT.exists():
            raise FileNotFoundError(f"Parquet root not found: {PARQUET_ROOT}")
        if not METADATA_FILE.exists():
            raise FileNotFoundError(f"Token metadata parquet not found: {METADATA_FILE}")
        for chain, p in TRANSFERS_FILES.items():
            if not p.exists():
                raise FileNotFoundError(f"Transfers parquet not found for chain {chain}: {p}")
        self.con.execute("SELECT 1 FROM analytics_staging.token_metadata LIMIT 1")
        for chain in TRANSFERS_CHAINS:
            self.con.execute(f"SELECT 1 FROM analytics_fact.token_transfers_{chain} LIMIT 1")
        return True

    def execute_all(self, sql: str, params: dict | None = None):
        if params:
            return self.con.execute(sql, params)
        return self.con.execute(sql)

    def fetch_one(self, sql: str, params: dict | None = None) -> dict | None:
        result = self.execute_all(sql, params)
        row = result.fetchone()
        if not row:
            return None
        cols = [d[0] for d in result.description]
        return dict(zip(cols, row))

    def fetch_all(self, sql: str, params: dict | None = None) -> list[dict]:
        result = self.execute_all(sql, params)
        if not result.description:
            return []
        cols = [d[0] for d in result.description]
        return [dict(zip(cols, r)) for r in result.fetchall()]

    def fetch_df(self, sql: str, params: dict | None = None):
        if params:
            return self.con.execute(sql, params).df()
        return self.con.execute(sql).df()

    def close(self) -> None:
        try:
            self.con.close()
        except Exception:
            pass

_store: DuckDBStore | None = None

def get_store(db_path: Path | None = None) -> DuckDBStore:
    global _store
    if _store is None:
        _store = DuckDBStore(db_path=db_path)
    return _store

def get_con(db_path: Path | None = None):
    return get_store(db_path=db_path).con

def test_connection(db_path: Path | None = None) -> bool:
    return get_store(db_path=db_path).test_connection()
