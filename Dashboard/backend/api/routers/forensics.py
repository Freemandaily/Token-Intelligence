from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.db import get_db
from analytics.forensics import compute_forensic_graph
from api.models.forensics import ForensicGraphResponse

router = APIRouter(prefix="/forensics", tags=["Forensics"])

@router.get(
    "/{wallet_address}",
    response_model=ForensicGraphResponse,
    summary="Get forensic graph for a wallet",
    description="Returns a 1-hop graph of all token transfers sent or received by a specific wallet address."
)
def get_forensic_graph(wallet_address: str, db: Session = Depends(get_db)):
    result = compute_forensic_graph(wallet_address.lower(), db)
    if not result["nodes"]:
        raise HTTPException(status_code=404, detail=f"No transfers found for wallet {wallet_address}")
    return result
