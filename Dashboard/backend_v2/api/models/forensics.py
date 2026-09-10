from pydantic import BaseModel
from typing import List


class ForensicTokenVolume(BaseModel):
    token_address: str
    token_symbol: str
    transfer_count: int
    total_volume: str


class ForensicEdge(BaseModel):
    source: str
    target: str
    tokens: List[ForensicTokenVolume]


class ForensicNode(BaseModel):
    id: str
    is_center: bool


class ForensicGraphResponse(BaseModel):
    wallet_address: str
    nodes: List[ForensicNode]
    edges: List[ForensicEdge]
