import time
from sqlalchemy import text
from database import SessionLocal
db = SessionLocal()
token = "0x3131f6b80c26936ab03f7d9d29eb4ddf36ac3fb5".lower()
query = text("SELECT min(block_timestamp) FROM analytics_fact.token_transfers_ethereum WHERE token_address = :token_address")
t0 = time.time()
res = db.execute(query, {"token_address": token}).scalar()
print(f"Result: {res}, Time: {time.time() - t0:.2f}s")
