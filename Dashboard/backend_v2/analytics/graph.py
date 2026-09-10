import networkx as nx
import community as community_louvain
import pandas as pd
from data.transfers import get_transfers_for_token, get_aggregated_edges_for_token, get_token_metadata
from data.balances import get_wallet_balances
from analytics.distribution import classify_wallet
from core.config import get_settings
from datetime import datetime, timezone

settings = get_settings()

def build_graph(transfers_df: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()
    ZERO = "0x0000000000000000000000000000000000000000"
    df = transfers_df[
        (transfers_df["from_address"] != ZERO) &
        (transfers_df["to_address"] != ZERO)
    ].copy()
    # The dataframe is already grouped into edges by SQL
    edges = df
    for _, row in edges.iterrows():
        G.add_edge(
            row["from_address"], row["to_address"],
            transfer_count=int(row["transfer_count"]),
            total_volume=float(row["amount"]),
        )
    return G

def compute_graph_analysis(token_address: str, top_n: int = 250) -> dict:
    """Compute a graph limited to the top N holders.

    Returns nodes, edges and basic statistics for visualization.
    """
    meta = get_token_metadata(token_address)
    chain = meta.get("chain", "ethereum")
    
    edges_df = get_aggregated_edges_for_token(token_address, chain)
    balances = get_wallet_balances(token_address, edges_df)
   

    if edges_df.empty:
        return {"error": f"No transfers found for token {token_address}"}

    # Get top N holders by balance
    top_balances = balances.head(top_n)
    top_holders_set = set(top_balances["wallet_address"].tolist())

    # Find intermediary map
    touching_top_holders = edges_df[
        edges_df["from_address"].isin(top_holders_set) |
        edges_df["to_address"].isin(top_holders_set)
    ]
    
    # print(touching_top_holders)
    intermediary_map = {}
    for _, row in touching_top_holders.iterrows():
        frm = row["from_address"]
        to = row["to_address"]
        if frm in top_holders_set and to not in top_holders_set:
            intermediary_map.setdefault(to, set()).add(frm)
        if to in top_holders_set and frm not in top_holders_set:
            intermediary_map.setdefault(frm, set()).add(to)
            
    # Require at least 5 connections to top holders to be considered a magic node
    # and cap it to the top 15 most connected hubs to prevent visual hairballs
    magic_candidates = [addr for addr, tops in intermediary_map.items() if len(tops) >= 5]
    magic_candidates.sort(key=lambda x: len(intermediary_map[x]), reverse=True)
    magic_nodes = set(magic_candidates[:15])
    allowed_nodes = top_holders_set.union(magic_nodes)

    filtered = edges_df[
        edges_df["from_address"].isin(allowed_nodes) &
        edges_df["to_address"].isin(allowed_nodes)
    ]
    
    G = build_graph(filtered)
    
    # Send unconnected nodes to the frontend
    G.add_nodes_from(top_holders_set)
    
    # Build node information
    balance_map = balances[balances["wallet_address"].isin(allowed_nodes)].set_index("wallet_address")[["balance", "balance_pct"]].to_dict("index")
    pagerank = nx.pagerank(G, alpha=0.85) if G.number_of_nodes() > 0 else {}
    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())
    communities = community_louvain.best_partition(G.to_undirected()) if G.number_of_nodes() > 0 else {}
    # Build global transfer stats from FULL transfers dataframe
    edges_df["amount_num"] = pd.to_numeric(edges_df["amount"], errors="coerce").fillna(0.0)
    
    in_stats = edges_df.groupby("to_address").agg(
        total_volume_in=("amount_num", "sum"),
        unique_wallets_in=("from_address", "nunique")
    ).to_dict("index")
    
    out_stats = edges_df.groupby("from_address").agg(
        total_volume_out=("amount_num", "sum"),
        unique_wallets_out=("to_address", "nunique")
    ).to_dict("index")

    # Build address names mapping
    address_names = {}
    for row in edges_df.itertuples(index=False):
        # row.from_address_name might not exist in all queries if columns vary, but typically it does.
        # We can use getattr to safely handle it
        fname = getattr(row, "from_address_name", None)
        tname = getattr(row, "to_address_name", None)
        if pd.notna(fname):
            address_names[row.from_address] = fname
        if pd.notna(tname):
            address_names[row.to_address] = tname
            
    nodes = []
    for wallet in G.nodes():
        bal = balance_map.get(wallet, {"balance": 0, "balance_pct": 0})
        bal_val = float(bal["balance"])
        bal_pct = float(bal["balance_pct"])
        is_magic = wallet in magic_nodes
        
        nodes.append({
            "id": wallet,
            "name": address_names.get(wallet),
            "balance": str(round(bal_val, 6)),
            "balance_pct": round(bal_pct, 6),
            "pagerank": round(pagerank.get(wallet, 0), 6),
            "degree": in_degree.get(wallet, 0) + out_degree.get(wallet, 0),
            "in_degree": in_degree.get(wallet, 0),
            "out_degree": out_degree.get(wallet, 0),
            "community_id": communities.get(wallet, -1),
            "wallet_type": "magic" if is_magic else classify_wallet(bal_pct),
            "total_volume_in": str(round(in_stats.get(wallet, {}).get("total_volume_in", 0), 6)),
            "total_volume_out": str(round(out_stats.get(wallet, {}).get("total_volume_out", 0), 6)),
            "unique_wallets_in": int(in_stats.get(wallet, {}).get("unique_wallets_in", 0)),
            "unique_wallets_out": int(out_stats.get(wallet, {}).get("unique_wallets_out", 0)),
        })

    # Build edge information
    edges = []
    for src, tgt, data in G.edges(data=True):
        edges.append({
            "source": src,
            "target": tgt,
            "transfer_count": data.get("transfer_count", 0),
            "total_volume": str(round(data.get("total_volume", 0), 6)),
            "direction": "out",
        })

        # Build community aggregation
    community_map: dict = {}
    for wallet, cid in communities.items():
        bal_pct = float(balance_map.get(wallet, {"balance_pct": 0})["balance_pct"])
        if cid not in community_map:
            community_map[cid] = {"community_id": cid, "wallet_count": 0, "total_balance_pct": 0.0}
        community_map[cid]["wallet_count"] += 1
        community_map[cid]["total_balance_pct"] += bal_pct

    # Build community list (sorted by balance_pct desc)
    communities_list = sorted([
        {
            "community_id": cid,
            "wallet_count": d["wallet_count"],
            "balance_pct": round(d["total_balance_pct"], 4),
            "label": "whale" if d["total_balance_pct"] > 20 else "exchange" if d["total_balance_pct"] > 5 else "retail",
        }
        for cid, d in community_map.items()
    ], key=lambda x: x["balance_pct"], reverse=True)

    meta = get_token_metadata(token_address)

    return {
        "token_address": token_address,
        "token_name": meta.get("name"),
        "token_symbol": meta.get("symbol"),
        "logo_url": meta.get("logo_url"),
        "chain": meta.get("chain"),
        "total_holders": len(top_balances),
        "magic_node_count": len(magic_nodes),
        "total_edges": G.number_of_edges(),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "nodes": nodes,
        "edges": edges,
        "communities": communities_list,
    }



def compute_top_holders_graph(token_address: str, top_n: int = 250) -> dict:
    """Alias for compute_graph_analysis keeping older endpoint name."""
    return compute_graph_analysis(token_address, top_n)
