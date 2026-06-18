from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session


import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from data.db import get_db
from analytics.graph import compute_graph_analysis
from api.models.graph import GraphResponse

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get(
    "/{token_address}",
    response_model=GraphResponse,
    summary="Get wallet connection graph for a token",
    description="Returns nodes, edges and community clusters for wallet graph visualization."
)
def get_graph(token_address: str, limit: int = 250, db: Session = Depends(get_db)):
    result = compute_graph_analysis(token_address.lower(), db, top_n=limit)
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
