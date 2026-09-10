from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.duckdb_store import get_store
try:
    from fastapi_cache import FastAPICache
    from fastapi_cache.backends.redis import RedisBackend
    from redis import asyncio as aioredis
    HAS_CACHE = True
except ImportError:
    HAS_CACHE = False
from api.routers import distribution, graph, forensics, tokens, deep_graph, bundling
@asynccontextmanager
async def lifespan(app: FastAPI):
    store = get_store()
    try:
        store.test_connection()
        print("DuckDB Parquet validated")
    except Exception as e:
        print(f"DuckDB validation failed: {e}")
        raise
    if HAS_CACHE:
        try:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            redis = aioredis.from_url(redis_url, encoding="utf8", decode_responses=False)
            FastAPICache.init(RedisBackend(redis), prefix="fastapi-cache")
            print("Redis cache initialized")
        except Exception as e:
            print(f"Redis cache init failed (continuing without cache): {e}")
    yield
app = FastAPI(title="Token Intelligence API v2 (DuckDB)", description="Analyze ERC-20 token distribution and wallet connectivity - DuckDB Parquet backend", version="2.0.0", docs_url="/docs", redoc_url="/redoc", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(distribution.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(forensics.router, prefix="/api/v1")
app.include_router(tokens.router, prefix="/api/v1")
app.include_router(bundling.router, prefix="/api/v1")
app.include_router(deep_graph.router, prefix="/api/v2")
@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "message": "Token Intelligence API v2 (DuckDB) is running"}
