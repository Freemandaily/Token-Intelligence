from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from data.db import test_connection
from api.routers import distribution, graph, forensics, tokens


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    test_connection()
    yield
    # shutdown (add cleanup here if needed later)


app = FastAPI(
    title="Token Intelligence API",
    description="Analyze ERC-20 token distribution and wallet connectivity on Ethereum",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,        # ← replaces @app.on_event("startup")
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(distribution.router, prefix="/api/v1")
app.include_router(graph.router,        prefix="/api/v1")
app.include_router(forensics.router,    prefix="/api/v1")
app.include_router(tokens.router,       prefix="/api/v1")


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "message": "Token Intelligence API is running"}