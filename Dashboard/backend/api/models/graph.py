from pydantic import BaseModel
from typing import List, Optional


class NodeItem(BaseModel):
    id: str
    name: Optional[str] = None
    balance: str
    balance_pct: float
    pagerank: float
    degree: int
    in_degree: int
    out_degree: int
    community_id: int
    wallet_type: str
    total_volume_in: str
    total_volume_out: str
    unique_wallets_in: int
    unique_wallets_out: int


class EdgeItem(BaseModel):
    source: str
    target: str
    transfer_count: int
    total_volume: str
    direction: str


class CommunityItem(BaseModel):
    community_id: int
    wallet_count: int
    balance_pct: float
    label: str


class TransferDetail(BaseModel):
    source: str
    target: str
    amount: str
    tx_hash: str


class HolderTransferItem(BaseModel):
    address: str
    inbound: List[TransferDetail]
    outbound: List[TransferDetail]


class TopHolderGraphResponse(BaseModel):
    token_address: str
    token_name: Optional[str] = None
    token_symbol: Optional[str] = None
    total_holders: int
    magic_node_count: int
    total_edges: int
    computed_at: str
    nodes: List[NodeItem]
    edges: List[EdgeItem]
    # optional additional fields can be added later if needed
class GraphResponse(TopHolderGraphResponse):
    """Alias for backward compatibility with existing router expecting GraphResponse.

    Includes the communities array returned by compute_graph_analysis.
    """
    communities: List[CommunityItem]


