import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

def get_forensic_transfers(wallet_address: str, db: Session) -> pd.DataFrame:
    """
    Query facts_transfer to find all rows where the searched wallet is the sender or receiver.
    Aggregates the volume and transfer count per unique (from_address, to_address, token_address) pair.
    """
    query = text("""
        SELECT 
            lower(from_address) as from_address, 
            lower(to_address) as to_address, 
            lower(token_address) as token_address,
            MAX(token_symbol) as token_symbol,
            COUNT(*) as transfer_count, 
            SUM(amount) as total_volume
        FROM main_fact.fact_token_transfers
        WHERE lower(from_address) = lower(:wallet_address)
           OR lower(to_address) = lower(:wallet_address)
        GROUP BY lower(from_address), lower(to_address), lower(token_address)
    """)
    result = db.execute(query, {"wallet_address": wallet_address})
    rows = result.fetchall()
    
    if not rows:
        return pd.DataFrame(columns=[
            "from_address", "to_address", "token_address", "token_symbol",
            "transfer_count", "total_volume"
        ])
    return pd.DataFrame(rows, columns=result.keys())
