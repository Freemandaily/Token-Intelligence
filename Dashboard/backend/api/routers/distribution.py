from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from data.db import get_db
from analytics.distribution import compute_distribution
from api.models.distribution import DistributionResponse

router = APIRouter(prefix="/distribution", tags=["Distribution"])


@router.get(
    "/{token_address}",
    response_model=DistributionResponse,
    summary="Get full token distribution analysis",
    description="Returns Gini, HHI, top holders and concentration score for a token."
)
def get_distribution(token_address: str, db: Session = Depends(get_db)):
    result = compute_distribution(token_address.lower(), db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
