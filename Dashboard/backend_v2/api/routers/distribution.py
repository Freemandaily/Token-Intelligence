from fastapi import APIRouter, HTTPException
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.distribution import compute_distribution
from api.models.distribution import DistributionResponse
router = APIRouter(prefix="/distribution", tags=["Distribution"])
@router.get("/{token_address}", response_model=DistributionResponse, summary="Get full token distribution analysis")
def get_distribution(token_address: str):
    result = compute_distribution(token_address.lower())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
