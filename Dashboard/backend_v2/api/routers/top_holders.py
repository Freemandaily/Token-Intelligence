from fastapi import APIRouter, HTTPException
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.graph import compute_top_holders_graph
from api.models.graph import TopHolderGraphResponse
router = APIRouter()
@router.get("/graph/top-holders", response_model=TopHolderGraphResponse, tags=["Graph"])
def get_top_holders_graph(token_address: str, limit: int = 250):
    result = compute_top_holders_graph(token_address.lower(), top_n=limit)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
