from __future__ import annotations
import pandas as pd
try:
    from .duckdb_store import get_store
except ImportError:
    from data.duckdb_store import get_store

def _resolve_chain(token_address: str) -> str:
    try:
        meta = get_token_metadata(token_address)
        return meta.get("chain", "ethereum") or "ethereum"
    except Exception:
        return "ethereum"

def get_aggregated_edges_for_token(token_address: str, chain: str | None = None) -> pd.DataFrame:
    if chain is None:
        chain = _resolve_chain(token_address)
    empty_cols = ["from_address", "to_address", "transfer_count", "amount", "from_address_name", "to_address_name"]
    table_name = f"analytics_fact.token_transfers_{chain}"
    sql = f"""SELECT lower(from_address) as from_address, lower(to_address) as to_address, COUNT(*) as transfer_count, SUM(cast(amount AS DOUBLE)) as amount, MAX(from_address_name) as from_address_name, MAX(to_address_name) as to_address_name, MAX(token_total_supply) as token_total_supply FROM {table_name} WHERE lower(token_address) = lower($token_address) GROUP BY lower(from_address), lower(to_address)"""
    try:
        df = get_store().fetch_df(sql, {"token_address": token_address.lower()})
        if df.empty:
            return pd.DataFrame(columns=empty_cols)
        return df
    except Exception as e:
        print(f"Warning: query failed for {table_name}: {e}")
        return pd.DataFrame(columns=empty_cols)

def get_transfers_for_token(token_address: str, chain: str | None = None) -> pd.DataFrame:
    if chain is None:
        chain = _resolve_chain(token_address)
    empty_cols = ["id", "tx_hash", "from_address", "to_address", "amount", "token_address", "block_timestamp", "block_number", "token_total_supply", "from_address_name", "to_address_name"]
    table_name = f"analytics_fact.token_transfers_{chain}"
    sql = f"""SELECT id, tx_hash, lower(from_address) as from_address, lower(to_address) as to_address, cast(amount AS DOUBLE) as amount, lower(token_address) as token_address, block_timestamp, block_number, token_total_supply, from_address_name, to_address_name FROM {table_name} WHERE lower(token_address) = lower($token_address) ORDER BY block_timestamp ASC"""
    try:
        df = get_store().fetch_df(sql, {"token_address": token_address.lower()})
        if df.empty:
            return pd.DataFrame(columns=empty_cols)
        return df
    except Exception as e:
        print(f"Warning: query failed for {table_name}: {e}")
        return pd.DataFrame(columns=empty_cols)

def get_token_launch_time(token_address: str, chain: str | None = None):
    if chain is None:
        chain = _resolve_chain(token_address)
    table_name = f"analytics_fact.token_transfers_{chain}"
    sql = f"SELECT min(block_timestamp) as launch_time FROM {table_name} WHERE lower(token_address) = lower($token)"
    try:
        row = get_store().con.execute(sql, {"token": token_address.lower()}).fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"Warning: launch time failed for {table_name}: {e}")
        return None

def get_hub_outbound_transfers(token_address: str, chain: str | None = None, min_wallets: int = 10) -> tuple[pd.DataFrame, int]:
    if chain is None:
        chain = _resolve_chain(token_address)
    empty_cols = ["id", "tx_hash", "from_address", "to_address", "amount", "block_timestamp", "block_number"]
    table_name = f"analytics_fact.token_transfers_{chain}"
    sql = f"""WITH PotentialBundlers AS (SELECT from_address as hub_address FROM {table_name} WHERE lower(token_address) = lower($token_address) GROUP BY from_address HAVING COUNT(*) >= $min_wallets) SELECT id, tx_hash, from_address, to_address, cast(amount AS DOUBLE) as amount, block_timestamp, block_number FROM {table_name} WHERE lower(token_address) = lower($token_address) AND lower(from_address) IN (SELECT lower(hub_address) FROM PotentialBundlers) ORDER BY block_number ASC, block_timestamp ASC"""
    try:
        df = get_store().fetch_df(sql, {"token_address": token_address.lower(), "min_wallets": min_wallets})
        hub_count = int(df["from_address"].nunique()) if not df.empty and "from_address" in df.columns else 0
        if df.empty:
            return pd.DataFrame(columns=empty_cols), 0
        return df, hub_count
    except Exception as e:
        print(f"Warning: hub outbounds failed for {table_name}: {e}")
        return pd.DataFrame(columns=empty_cols), 0

def get_token_metadata(token_address: str) -> dict:
    sql = """SELECT lower(token_address) as token_address, name, symbol, decimals, total_supply, supply_source, logo_url, chain FROM analytics_staging.token_metadata WHERE lower(token_address) = lower($token_address) LIMIT 1"""
    try:
        result = get_store().con.execute(sql, {"token_address": token_address.lower()})
        row = result.fetchone()
        if not row:
            raise ValueError("No metadata row found")
        cols = [d[0] for d in result.description]
        return dict(zip(cols, row))
    except Exception as e:
        print(f"Warning: Could not fetch token metadata for {token_address}: {e}")
        return {"token_address": token_address, "name": None, "symbol": None, "decimals": 18, "total_supply": None, "supply_source": "unknown", "logo_url": None, "chain": "ethereum"}

def get_available_tokens() -> list:
    sql = """SELECT lower(token_address) as token_address, name, symbol, chain, logo_url FROM analytics_staging.token_metadata ORDER BY chain ASC, name ASC NULLS LAST"""
    try:
        result = get_store().con.execute(sql)
        rows = result.fetchall()
        if not rows:
            return []
        cols = [d[0] for d in result.description]
        return [dict(zip(cols, r)) for r in rows]
    except Exception as e:
        print(f"Warning: Could not fetch available tokens: {e}")
        return []
