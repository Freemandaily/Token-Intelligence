from fastapi import APIRouter, HTTPException
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.graph import compute_graph_analysis
from api.models.graph import GraphResponse
try:
    from fastapi_cache.decorator import cache
except ImportError:
    def cache(expire=900):
        def deco(fn): return fn
        return deco
router = APIRouter(prefix="/graph", tags=["Graph"])
@router.get("/{token_address}", response_model=GraphResponse, summary="Get wallet connection graph for a token")
@cache(expire=900)
def get_graph(token_address: str, limit: int = 250):
    result = compute_graph_analysis(token_address.lower(), top_n=limit)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
