from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from api.models.graph import TopHolderGraphResponse
from analytics.graph import compute_top_holders_graph
from core.config import get_db

router = APIRouter()

@router.get("/graph/top-holders", response_model=TopHolderGraphResponse, tags=["Graph"])
def get_top_holders_graph(token_address: str, limit: int = 250, db: Session = Depends(get_db)):
    """Return a graph containing only the top `limit` holders and the transfers between them.
    The result is suitable for a circular layout visualization.
    """
    result = compute_top_holders_graph(token_address, db, top_n=limit)
    return result
