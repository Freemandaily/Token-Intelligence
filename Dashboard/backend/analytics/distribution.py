import numpy as np
import pandas as pd
from data.balances import get_wallet_balances
from sqlalchemy.orm import Session
from core.config import get_settings

settings = get_settings()


def compute_gini(balances: pd.Series) -> float:
    if balances.empty or balances.sum() == 0:
        return 0.0
    sorted_balances = np.sort(balances.values)
    n = len(sorted_balances)
    cumulative = np.cumsum(sorted_balances)
    gini = (2 * np.sum((np.arange(1, n + 1)) * sorted_balances) - (n + 1) * cumulative[-1])
    gini = gini / (n * cumulative[-1])
    return round(float(gini), 4)


def compute_hhi(balance_pcts: pd.Series) -> float:
    if balance_pcts.empty:
        return 0.0
    shares = balance_pcts / 100
    return round(float((shares ** 2).sum()), 4)


def concentration_score(gini: float, hhi: float, top_10_pct: float) -> str:
    if top_10_pct >= 80 or gini >= 0.9:
        return "highly_concentrated"
    elif top_10_pct >= 60 or gini >= 0.75:
        return "concentrated"
    elif top_10_pct >= 40 or gini >= 0.55:
        return "moderate"
    else:
        return "healthy"


def classify_wallet(balance_pct: float) -> str:
    if balance_pct >= 1.0:
        return "whale"
    elif balance_pct >= 0.1:
        return "mid"
    else:
        return "retail"


def compute_distribution(token_address: str, db: Session) -> dict:
    from data.transfers import get_transfers_for_token
    df = get_transfers_for_token(token_address, db)
    if df.empty:
        return {"error": f"No transfers found for token {token_address}"}

    balances = get_wallet_balances(token_address, db, df)
    
    if "token_total_supply" in df.columns and not df["token_total_supply"].isnull().all():
        total_supply = float(df["token_total_supply"].dropna().iloc[0])
    else:
        total_supply = float(balances["balance"].sum())
    holder_count = len(balances)
    gini         = compute_gini(balances["balance"])
    hhi          = compute_hhi(balances["balance_pct"])
    top_10       = balances.head(10)["balance_pct"].sum()#.round(4)
    top_50       = balances.head(50)["balance_pct"].sum()#.round(4)
    score        = concentration_score(gini, hhi, top_10)

    limit = settings.top_holders_limit
    top_holders = balances.head(limit).copy()
    top_holders["wallet_type"] = top_holders["balance_pct"].apply(classify_wallet)
    top_holders["balance"] = top_holders["balance"].astype(float).fillna(0).apply(lambda x: str(round(x, 6)))

    return {
        "token_address": token_address,
        "total_supply":  str(round(total_supply, 6)),
        "holder_count":  holder_count,
        "concentration": {
            "gini":       gini,
            "hhi":        hhi,
            "top_10_pct": float(round(top_10, 4)),
            "top_50_pct": float(round(top_50, 4)),
            "score":      score,
        },
        "top_holders": top_holders[[
            "wallet_address", "balance", "balance_pct", "wallet_type"
        ]].to_dict(orient="records"),
    }
