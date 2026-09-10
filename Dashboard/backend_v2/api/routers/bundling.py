from fastapi import APIRouter, Query
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from analytics.bundling import compute_bundling
try:
    from fastapi_cache.decorator import cache
except ImportError:
    def cache(expire=900):
        def deco(fn): return fn
        return deco
router = APIRouter(prefix="/bundling", tags=["Bundling Analytics"])
@router.get("/{token_address}")
@cache(expire=900)
def get_bundling_events(token_address: str, max_block_gap: int = Query(default=0, ge=0), min_wallets: int = Query(default=10, ge=2)):
    return compute_bundling(token_address=token_address.lower(), bundle_max_block_gap=max_block_gap, bundle_min_wallets=min_wallets)
