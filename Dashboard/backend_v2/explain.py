import time
from sqlalchemy import text
from database import SessionLocal
db = SessionLocal()
token = "0x3131f6b80c26936ab03f7d9d29eb4ddf36ac3fb5".lower()
query = text(f"""
    WITH PotentialBundlers AS (
        SELECT lower(from_address) as hub_address
        FROM analytics_fact.token_transfers_ethereum
        WHERE token_address = :token_address
        GROUP BY lower(from_address)
        HAVING COUNT(*) >= 10
    )
    SELECT 
        id, tx_hash, lower(from_address) as from_address, lower(to_address) as to_address,
        amount::numeric as amount, block_timestamp, block_number
    FROM analytics_fact.token_transfers_ethereum
    WHERE token_address = :token_address
      AND lower(from_address) IN (SELECT hub_address FROM PotentialBundlers)
""")
t0 = time.time()
res = db.execute(query, {"token_address": token})
c = 0
for r in res:
    c += 1
print(f"Fetched {c} rows in {time.time() - t0:.2f} seconds.")
