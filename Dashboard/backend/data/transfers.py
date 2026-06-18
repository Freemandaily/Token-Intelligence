import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text


def get_transfers_for_token(token_address: str, db: Session) -> pd.DataFrame:
    query = text("""
        SELECT
            id,
            lower(from_address)  as from_address,
            lower(to_address)    as to_address,
            amount::numeric      as amount,
            lower(token_address) as token_address,
            block_timestamp,
            token_total_supply,
            from_address_name,
            to_address_name
        FROM main_fact.fact_token_transfers
        WHERE token_address = :token_address
        ORDER BY block_timestamp ASC
    """)
    result = db.execute(query, {"token_address": token_address.lower()})
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame(columns=[
            "id", "from_address", "to_address",
            "amount", "token_address", "block_timestamp",
            "token_total_supply", "from_address_name", "to_address_name"
        ])
    return pd.DataFrame(rows, columns=result.keys())


def get_token_metadata(token_address: str, db: Session) -> dict:
    query = text("""
        SELECT lower(token_address) as token_address, name, symbol, decimals, total_supply, supply_source
        FROM main_staging.token_metadata
        WHERE lower(token_address) = :token_address
        LIMIT 1
    """)
    result = db.execute(query, {"token_address": token_address.lower()})
    row = result.fetchone()
    if not row:
        return {
            "token_address": token_address,
            "name": None, "symbol": None,
            "decimals": 18, "total_supply": None,
            "supply_source": "unknown"
        }
    return dict(row._mapping)

def get_available_tokens(db: Session) -> list:
    query = text("""
        SELECT lower(token_address) as token_address, name, symbol
        FROM main_staging.token_metadata
        ORDER BY name ASC NULLS LAST
    """)
    result = db.execute(query)
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]
