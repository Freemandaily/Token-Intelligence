from fastapi import APIRouter
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from data.transfers import get_available_tokens
router = APIRouter(prefix="/tokens", tags=["Tokens"])
@router.get("/", summary="Get available tokens")
def get_tokens():
    return get_available_tokens()
