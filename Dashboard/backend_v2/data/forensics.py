from __future__ import annotations
import pandas as pd
try:
    from .duckdb_store import get_store
except ImportError:
    from data.duckdb_store import get_store
def get_forensic_transfers(wallet_address: str) -> pd.DataFrame:
    empty_cols = ["from_address", "to_address", "token_address", "token_symbol", "transfer_count", "total_volume"]
    chains = ["base", "ethereum", "arbitrum", "optimism", "bsc"]
    union_parts = []
    for chain in chains:
        table_name = f"analytics_fact.token_transfers_{chain}"
        union_parts.append(f"""SELECT lower(from_address) as from_address, lower(to_address) as to_address, lower(token_address) as token_address, NULL as token_symbol, cast(amount AS DOUBLE) as amount FROM {table_name} WHERE lower(from_address) = lower($wallet_address) OR lower(to_address) = lower($wallet_address)""")
    inner_sql = " UNION ALL ".join(union_parts)
    sql = f"""SELECT from_address, to_address, token_address, MAX(token_symbol) as token_symbol, COUNT(*) as transfer_count, SUM(amount) as total_volume FROM ({inner_sql}) AS combined_transfers GROUP BY from_address, to_address, token_address"""
    try:
        df = get_store().fetch_df(sql, {"wallet_address": wallet_address.lower()})
        if df.empty:
            return pd.DataFrame(columns=empty_cols)
        return df
    except Exception as e:
        print(f"Warning: Could not query forensic transfers: {e}")
        return pd.DataFrame(columns=empty_cols)
