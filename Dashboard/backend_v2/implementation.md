# Backend v2 Implementation Plan - DuckDB Migration

## Goal
Migrate the copied backend in `backend_v2` to read from local Parquet files using DuckDB instead of querying Postgres live. Only the data access layer changes. All API routes, response models, analytics logic, and frontend contracts stay identical.

You manually copied `backend` to `backend_v2`. This plan explains what to modify in that copy to make it DuckDB backed.

## Parquet source of truth
All data comes from `Dashboard/Data/parquet/`:

- `token_metadata.parquet` -> replaces `analytics_staging.token_metadata`
- `transfers_ethereum.parquet` -> replaces `analytics_fact.token_transfers_ethereum`
- `transfers_base.parquet` -> replaces `analytics_fact.token_transfers_base`
- `transfers_arbitrum.parquet` -> replaces `analytics_fact.token_transfers_arbitrum`
- `transfers_optimism.parquet` -> replaces `analytics_fact.token_transfers_optimism`
- `transfers_bsc.parquet` -> replaces `analytics_fact.token_transfers_bsc`

Columns to preserve:
- metadata: `token_address, name, symbol, decimals, total_supply, supply_source, logo_url, chain`
- transfers: `id, tx_hash, from_address, to_address, amount, token_address, block_timestamp, block_number, token_total_supply, from_address_name, to_address_name`

Parquet notes observed:
- `amount` is DECIMAL, `token_address/from/to` are VARCHAR, need lowercasing in views
- `from_address_name/to_address_name` are INTEGER in parquet (often null), must cast to VARCHAR in views so routers do not break
- no `token_symbol` column in transfers parquet, forensics must select NULL as token_symbol or join metadata

## Non-goal
Do not change API contracts, response shapes, analytics algorithms, or frontend code. The only intent is to replace Postgres with DuckDB Parquet reads.

## What to change in this copy

### 1. core/config.py
Remove Postgres settings (`db_host, db_port, db_name, db_user, db_pass, database_url`).

Add:
- `parquet_root: str = <repo>/Data/parquet`
- `duckdb_path: str = <repo>/backend_v2/backend_v2.duckdb` (file backed, keep process long lived)
Keep `top_holders_limit, min_balance_pct, redis_url`.

This isolates path logic to config.

### 2. data/db.py -> data/duckdb_store.py
Create new `data/duckdb_store.py` and deprecate `data/db.py`:

- `from core.config import get_settings`
- Resolve `PARQUET_ROOT`, `METADATA_FILE`, `TRANSFERS_FILES` dict for 5 chains
- Class `DuckDBStore`:
  - `__init__(db_path=None)` opens `duckdb.connect`
  - `_attach_parquet()` creates schemas `analytics_staging` and `analytics_fact` if not exists, then `CREATE OR REPLACE VIEW` for each table using embedded `read_parquet('path')` strings (do not use param binding for file paths, do not use httpfs or ATTACH for local files)
  - Views normalize: `lower(token_address), lower(from_address), lower(to_address), cast(amount AS DOUBLE), cast(from_address_name AS VARCHAR)`
  - `test_connection()` validates files exist and views queryable
  - helpers `fetch_df(sql, params), fetch_one, fetch_all, execute_all`
- Singleton `get_store()` and `get_con()` plus module level `test_connection()`

Keep connection long lived per process, not per request.

Do not delete `data/db.py` immediately, but routers should stop importing it. You can later remove sqlalchemy imports.

### 3. data/transfers.py
Remove `sqlalchemy` imports and `db: Session` param from all functions.

New signatures:
- `get_aggregated_edges_for_token(token_address, chain=None)`
- `get_transfers_for_token(token_address, chain=None)`
- `get_token_launch_time(token_address, chain=None)`
- `get_hub_outbound_transfers(token_address, chain=None, min_wallets=10)`
- `get_token_metadata(token_address)`
- `get_available_tokens()`

If `chain is None`, resolve via `get_token_metadata(token_address).get("chain", "ethereum")`.

Use `store = get_store()` and `store.fetch_df` or `store.con.execute` with `$param` binding for values (lowercasing via `lower(token_address)=lower($token_address)`).

Preserve empty DataFrame column schemas exactly as backend does so analytics does not break.

### 4. data/balances.py
Remove `db: Session` param. `get_wallet_balances(token_address, chain=None, transfer_df=None)` should handle flexible caller: `get_wallet_balances(token_address, edges_df)` where second arg is DataFrame (detect `isinstance(chain, pd.DataFrame)`). Internally call `get_transfers_for_token(token_address, chain)` if `transfer_df is None`.

Keep balance_pct logic, ZERO_ADDRESS filter, token_total_supply fallback.

### 5. data/forensics.py
Remove `db: Session`. Union across 5 chains. Since parquet has no `token_symbol`, select `NULL as token_symbol`:

```
SELECT lower(from_address)..., NULL as token_symbol, cast(amount AS DOUBLE) ...
FROM analytics_fact.token_transfers_{chain}
WHERE lower(from_address)=lower($wallet) OR lower(to_address)=lower($wallet)
```

Then aggregate outer query `GROUP BY from_address, to_address, token_address` with `MAX(token_symbol), COUNT(*), SUM(amount)`.

### 6. requirements.txt
Add `duckdb, pyarrow` (already used). You may keep `psycopg2-binary, sqlalchemy` temporarily for reference or remove them once db.py is retired. No new API deps needed.

### 7. api/main.py
Replace `from data.db import test_connection` with `from data.duckdb_store import get_store`. In `lifespan` call `get_store().test_connection()` instead of Postgres check. Make Redis cache init optional (try except) so service starts without Redis.

Keep all router prefixes identical: `/api/v1` for distribution, graph, forensics, tokens, bundling and `/api/v2` for deep_graph.

### 8. api/routers/*
Remove `Depends(get_db)` and `db: Session` params. Call analytics directly:

- `tokens.py: get_available_tokens()`
- `graph.py: compute_graph_analysis(token_address.lower(), top_n=limit)`
- `distribution.py: compute_distribution(token_address.lower())`
- `bundling.py: compute_bundling(token_address.lower(), bundle_max_block_gap, bundle_min_wallets)`
- `forensics.py: compute_forensic_graph(wallet_address.lower())`
- `deep_graph.py: compute_deep_analysis(token_address.lower(), ...)` plus `top_holders.py` if present

Keep `fastapi_cache` decorators but make them no-op if Redis missing.

### 9. analytics/*
Ideally no logic change. Only remove `db: Session` param and update data calls to omit `db`. For example `compute_graph_analysis(token_address, top_n=250)` does `meta = get_token_metadata(token_address)` and `edges_df = get_aggregated_edges_for_token(token_address, chain)`.

If you leave analytics signatures with `db` param, routers must still pass it, which adds confusion. Prefer to update analytics to DuckDB signatures and keep analytics logic otherwise verbatim.

## DuckDB integration details
- Do not use `INSTALL httpfs; LOAD httpfs` or `ATTACH 'folder' AS ...` for local parquet. Just `read_parquet('/absolute/path')` in views.
- Create schemas before views: `CREATE SCHEMA IF NOT EXISTS analytics_staging`
- Views should be `CREATE OR REPLACE VIEW analytics_fact.token_transfers_ethereum AS SELECT ... FROM read_parquet('...')`
- Amount handling: original uses `amount::numeric`, DuckDB equivalent is `cast(amount AS DOUBLE)`. Keep numeric handling and `SUM(cast(amount AS DOUBLE))`
- Address normalization: always `lower(...)` in views and where clauses
- File refresh: when parquet is regenerated, views read latest file on next query without restart. If you use a file backed DuckDB (`backend_v2.duckdb`), you may need to recreate views on startup only. No reload endpoint needed for first deliverable.

## Implementation sequence
1. Update `core/config.py` and create `data/duckdb_store.py` with test_connection verification
2. Rewrite `data/transfers.py`, `data/balances.py`, `data/forensics.py` to use store, verify with `uv run python -c "from data.duckdb_store import get_store; get_store().test_connection()"`
3. Update `api/main.py` lifespan and remove `data.db` imports, confirm `uv run fastapi dev api/main.py` starts
4. Update `api/routers/*` to remove Session dependency, keep response models
5. Update `analytics/*` signatures if needed (remove db param)
6. Parity testing: hit `/api/v1/tokens`, `/api/v1/graph/{token}`, `/api/v1/distribution/{token}`, `/api/v1/bundling/{token}`, `/api/v1/forensics/{wallet}`, `/api/v2/deep-graph/{token}` and compare structure to original backend for same token. Check empty vs 404 behavior, lowercasing, numeric formatting.

## Recommended first deliverable
A working `backend_v2` that starts, validates Parquet via `get_store().test_connection()`, serves `GET /api/v1/tokens` and one analytics endpoint `GET /api/v1/graph/{token_address}` end to end via DuckDB. Once that passes, migrate remaining endpoints one by one.

## Open decisions to settle before finishing
- Keep Postgres fallback or DuckDB only for these analytics?
- File backed DuckDB vs pure in-memory with explicit read_parquet per query?
- Share analytics code with backend or maintain copy under backend_v2?
- Keep per-chain files or move to partitioned folder later? Data access module should own path logic so change is localized.
