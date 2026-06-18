from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.db import get_db
from data.transfers import get_available_tokens

router = APIRouter(prefix="/tokens", tags=["Tokens"])

@router.get(
    "/",
    summary="Get available tokens",
    description="Returns a list of all tokens available in the database for analysis."
)
def get_tokens(db: Session = Depends(get_db)):
    return get_available_tokens(db)
