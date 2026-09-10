from fastapi import APIRouter, HTTPException
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.forensics import compute_forensic_graph
from api.models.forensics import ForensicGraphResponse
router = APIRouter(prefix="/forensics", tags=["Forensics"])
@router.get("/{wallet_address}", response_model=ForensicGraphResponse, summary="Get forensic graph for a wallet")
def get_forensic_graph(wallet_address: str):
    result = compute_forensic_graph(wallet_address.lower())
    if not result["nodes"]:
        raise HTTPException(status_code=404, detail=f"No transfers found for wallet {wallet_address}")
    return result
