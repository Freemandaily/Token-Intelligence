from __future__ import annotations
import pandas as pd
try:
    from .transfers import get_transfers_for_token
except ImportError:
    from data.transfers import get_transfers_for_token
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
def get_wallet_balances(token_address: str, chain: str | None = None, transfer_df=None) -> pd.DataFrame:
    if isinstance(chain, pd.DataFrame) and transfer_df is None:
        transfer_df = chain
        chain = None
    if transfer_df is None:
        df = get_transfers_for_token(token_address, chain)
    else:
        df = transfer_df
    if df is None or df.empty:
        return pd.DataFrame(columns=["wallet_address", "balance"])
    if "to_address" not in df.columns:
        return pd.DataFrame(columns=["wallet_address", "balance"])
    df = df.copy()
    df["to_address"] = df["to_address"].astype(str).str.lower()
    df["from_address"] = df["from_address"].astype(str).str.lower()
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    received = df[df["to_address"] != ZERO_ADDRESS].groupby("to_address")["amount"].sum()
    received.index.name = "wallet_address"
    sent = df[df["from_address"] != ZERO_ADDRESS].groupby("from_address")["amount"].sum()
    sent.index.name = "wallet_address"
    balances = received.subtract(sent, fill_value=0).reset_index()
    balances.columns = ["wallet_address", "balance"]
    balances["balance"] = balances["balance"].astype(float)
    balances = balances[balances["balance"] > 0].copy()
    if balances.empty:
        return pd.DataFrame(columns=["wallet_address", "balance"])
    if "token_total_supply" in df.columns and not df["token_total_supply"].isnull().all():
        total_supply = float(pd.to_numeric(df["token_total_supply"], errors="coerce").dropna().iloc[0])
    else:
        total_supply = float(balances["balance"].sum())
    if total_supply > 0:
        balances["balance_pct"] = (balances["balance"] / total_supply * 100).round(6)
    else:
        balances["balance_pct"] = 0.0
    balances = balances.sort_values("balance", ascending=False).reset_index(drop=True)
    return balances

def get_total_supply_from_balances(token_address: str, chain: str | None = None) -> float:
    df = get_transfers_for_token(token_address, chain)
    if df is None or df.empty:
        return 0.0
    if "token_total_supply" in df.columns and not df["token_total_supply"].isnull().all():
        return float(pd.to_numeric(df["token_total_supply"], errors="coerce").dropna().iloc[0])
    balances = get_wallet_balances(token_address, chain, df)
    if balances.empty:
        return 0.0
    return float(balances["balance"].sum())
