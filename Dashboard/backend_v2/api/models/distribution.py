from pydantic import BaseModel
from typing import List


class ConcentrationMetrics(BaseModel):
    gini: float
    hhi: float
    top_10_pct: float
    top_50_pct: float
    score: str


class HolderItem(BaseModel):
    wallet_address: str
    balance: str
    balance_pct: float
    wallet_type: str


class DistributionResponse(BaseModel):
    token_address: str
    total_supply: str
    holder_count: int
    concentration: ConcentrationMetrics
    top_holders: List[HolderItem]
