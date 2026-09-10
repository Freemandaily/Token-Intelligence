from fastapi import APIRouter, Query
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.deep_graph import compute_deep_analysis
try:
    from fastapi_cache.decorator import cache
except ImportError:
    def cache(expire=900):
        def deco(fn): return fn
        return deco
router = APIRouter(prefix="/deep-graph", tags=["Deep Graph Analysis (v2)"])
@router.get("/{token_address}")
@cache(expire=900)
def get_deep_graph(token_address: str, min_transfer_count: int = Query(default=3, ge=1), min_edge_volume_pct: float = Query(default=0.001, ge=0), min_degree: int = Query(default=2, ge=1), min_community_size: int = Query(default=3, ge=2), source: str | None = Query(default=None), target: str | None = Query(default=None)):
    return compute_deep_analysis(token_address=token_address.lower(), min_transfer_count=min_transfer_count, min_edge_volume_pct=min_edge_volume_pct, min_degree=min_degree, min_community_size=min_community_size, path_source=source, path_target=target)
