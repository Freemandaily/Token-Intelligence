import time
import pandas as pd
from sqlalchemy import text
from database import SessionLocal

db = SessionLocal()
token = "0x3131f6b80c26936ab03f7d9d29eb4ddf36ac3fb5"
chain = "ethereum"

print("Starting Hub Query Test...")
t0 = time.time()
query = text(f"""
    WITH Hubs AS (
        SELECT lower(from_address) as hub_address
        FROM analytics_fact.token_transfers_{chain}
        WHERE token_address = :token_address
        GROUP BY lower(from_address)
        HAVING COUNT(DISTINCT lower(to_address)) > 500
    )
    SELECT 
        id, tx_hash, lower(from_address) as from_address, lower(to_address) as to_address,
        amount::numeric as amount, block_timestamp, block_number
    FROM analytics_fact.token_transfers_{chain}
    WHERE token_address = :token_address
      AND lower(from_address) IN (SELECT hub_address FROM Hubs)
""")
df = pd.read_sql(query, db.connection(), params={"token_address": token.lower()})
t1 = time.time()

print(f"Hub outbounds fetched: {len(df)} rows")
print(f"Time taken: {t1 - t0:.2f} seconds")

# Also fetch launch time
t2 = time.time()
q2 = text(f"SELECT min(block_timestamp) FROM analytics_fact.token_transfers_{chain} WHERE token_address = :token_address")
launch_time = db.execute(q2, {"token_address": token.lower()}).scalar()
t3 = time.time()
print(f"Launch time: {launch_time}")
print(f"Time taken: {t3 - t2:.2f} seconds")
