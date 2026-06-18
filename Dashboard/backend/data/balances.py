import pandas as pd
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.transfers import get_transfers_for_token

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def get_wallet_balances(token_address: str, db: Session,transfer_df=None) -> pd.DataFrame:
    if transfer_df is None:
        df = get_transfers_for_token(token_address, db)
    else:
        df = transfer_df
    if df.empty:
        return pd.DataFrame(columns=["wallet_address", "balance"])

    received = df[df["to_address"] != ZERO_ADDRESS].groupby("to_address")["amount"].sum()
    received.index.name = "wallet_address"

    sent = df[df["from_address"] != ZERO_ADDRESS].groupby("from_address")["amount"].sum()
    sent.index.name = "wallet_address"

    balances = received.subtract(sent, fill_value=0).reset_index()
    balances.columns = ["wallet_address", "balance"]
    balances["balance"] = balances["balance"].astype(float)
    balances = balances[balances["balance"] > 0].copy()

    if "token_total_supply" in df.columns and not df["token_total_supply"].isnull().all():
        # Get the first non-null value (assuming it's the same for all rows of this token)
        total_supply = float(df["token_total_supply"].dropna().iloc[0])
    else:
        total_supply = balances["balance"].sum()

    if total_supply > 0:
        balances["balance_pct"] = (balances["balance"] / total_supply * 100).round(6)
    else:
        balances["balance_pct"] = 0.0
    balances = balances.sort_values("balance", ascending=False).reset_index(drop=True)
    return balances


def get_total_supply_from_balances(token_address: str, db: Session) -> float:
    df = get_transfers_for_token(token_address, db)
    if df.empty:
        return 0.0
    
    if "token_total_supply" in df.columns and not df["token_total_supply"].isnull().all():
        return float(df["token_total_supply"].dropna().iloc[0])
        
    balances = get_wallet_balances(token_address, db, df)
    if balances.empty:
        return 0.0
    return float(balances["balance"].sum())
