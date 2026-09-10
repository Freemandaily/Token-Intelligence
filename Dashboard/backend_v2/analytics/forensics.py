import pandas as pd


from data.forensics import get_forensic_transfers


def compute_forensic_graph(wallet_address: str) -> dict:
    df = get_forensic_transfers(wallet_address)
    if df.empty:
        return {"wallet_address": wallet_address, "nodes": [], "edges": []}

    # Extract all unique nodes
    nodes_set = set(df["from_address"]).union(set(df["to_address"]))
    nodes = [{"id": n, "is_center": n == wallet_address} for n in nodes_set]

    # Group edges by (from_address, to_address)
    edges_map = {}
    for _, row in df.iterrows():
        src = row["from_address"]
        tgt = row["to_address"]
        pair = (src, tgt)
        if pair not in edges_map:
            edges_map[pair] = {"source": src, "target": tgt, "tokens": []}
            
        edges_map[pair]["tokens"].append({
            "token_address": row["token_address"],
            "token_symbol": row["token_symbol"] if pd.notnull(row["token_symbol"]) else "UNKNOWN",
            "transfer_count": int(row["transfer_count"]),
            "total_volume": str(round(float(row["total_volume"]), 6))
        })
        
    return {
        "wallet_address": wallet_address,
        "nodes": nodes,
        "edges": list(edges_map.values())
    }
