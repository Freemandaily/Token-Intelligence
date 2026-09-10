"""
analytics/deep_graph.py
-----------------------
Deep token network analysis engine.

This module is ISOLATED from the existing graph.py — it does NOT touch
any existing /api/v1 endpoints or models.

Analysis pipeline:
  1. Build full directed graph from ALL transfers (no top-N cap)
  2. Apply 3-layer noise filtering:
       Layer 1 (edge): min transfer count AND min volume pct
       Layer 2 (node): min degree after edge pruning
       Layer 3 (community): min community size after Louvain
  3. Compute centrality metrics (PageRank, betweenness approx, degree)
  4. Map 2-hop indirect connections (relay nodes)
  5. Run Louvain community detection on pruned graph
  6. Flag suspicious patterns (wash trades, hub-and-spoke, circular flows)
  7. Optional: shortest path tracing between two wallets
"""

import networkx as nx
import community as community_louvain
import pandas as pd
from datetime import datetime, timezone

from data.transfers import get_transfers_for_token, get_aggregated_edges_for_token, get_token_metadata
from data.balances import get_wallet_balances
from analytics.distribution import classify_wallet

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


# ─────────────────────────────────────────────
# Step 1 — Build Raw Full Graph
# ─────────────────────────────────────────────

def build_full_graph(edges_df: pd.DataFrame) -> nx.DiGraph:
    """
    Build a directed weighted graph from pre-aggregated edges.
    """
    G = nx.DiGraph()
    if edges_df.empty:
        return G

    if "amount_num" not in edges_df.columns:
        edges_df["amount_num"] = pd.to_numeric(edges_df["amount"], errors="coerce").fillna(0.0)

    # Use edges_df directly instead of grouping
    edges = edges_df

    for _, row in edges.iterrows():
        G.add_edge(
            row["from_address"], row["to_address"],
            transfer_count=int(row["transfer_count"]),
            total_volume=float(row["amount_num"]),
        )
    return G


# ─────────────────────────────────────────────
# Step 2 — Three-Layer Noise Filtering
# ─────────────────────────────────────────────

def apply_edge_threshold(G: nx.DiGraph, min_transfer_count: int, min_volume_pct: float) -> nx.DiGraph:
    """
    Layer 1: Remove edges where BOTH conditions are not met:
      - transfer_count >= min_transfer_count
      - edge volume >= min_volume_pct % of total graph volume
    Both conditions must pass (AND logic).
    """
    total_volume = sum(d["total_volume"] for _, _, d in G.edges(data=True))
    if total_volume == 0:
        return G

    volume_threshold = total_volume * (min_volume_pct / 100.0)

    edges_to_remove = [
        (u, v) for u, v, d in G.edges(data=True)
        if d["transfer_count"] < min_transfer_count or d["total_volume"] < volume_threshold
    ]
    G.remove_edges_from(edges_to_remove)
    return G


def apply_node_threshold(G: nx.DiGraph, min_degree: int) -> nx.DiGraph:
    """
    Layer 2: Remove nodes where total degree (in + out) < min_degree
    after edge pruning. Iteratively prune until stable.
    """
    while True:
        low_degree = [n for n in G.nodes() if G.degree(n) < min_degree]
        if not low_degree:
            break
        G.remove_nodes_from(low_degree)
    return G


def apply_community_threshold(communities: dict, min_community_size: int) -> dict:
    """
    Layer 3: Remove community assignments for communities smaller than threshold.
    Nodes in discarded communities are assigned community_id = -1.
    """
    from collections import Counter
    sizes = Counter(communities.values())
    return {
        node: cid if sizes[cid] >= min_community_size else -1
        for node, cid in communities.items()
    }


# ─────────────────────────────────────────────
# Step 3 — Centrality Metrics
# ─────────────────────────────────────────────

def compute_centrality_metrics(G: nx.DiGraph) -> dict:
    """
    Compute per-node centrality metrics on the pruned graph.
    Betweenness uses k-approximation (k=min(500, n)) for scalability.
    """
    if G.number_of_nodes() == 0:
        return {}

    pagerank = nx.pagerank(G, alpha=0.85)

    k = min(50, G.number_of_nodes())
    betweenness = nx.betweenness_centrality(G, k=k, normalized=True)

    in_degree = dict(G.in_degree())
    out_degree = dict(G.out_degree())

    return {
        node: {
            "pagerank": round(pagerank.get(node, 0), 6),
            "betweenness": round(betweenness.get(node, 0), 6),
            "in_degree": in_degree.get(node, 0),
            "out_degree": out_degree.get(node, 0),
        }
        for node in G.nodes()
    }


# ─────────────────────────────────────────────
# Step 4 — 2-Hop Indirect Connection Mapping
# ─────────────────────────────────────────────

def compute_relay_counts(G: nx.DiGraph) -> dict:
    """
    For every node B, count how many (A, C) pairs exist where A->B and B->C.
    relay_count[B] = number of distinct wallet pairs B bridges.
    High relay count indicates a router / exchange / aggregator hub.
    """
    relay_counts = {}
    for node in G.nodes():
        predecessors = set(G.predecessors(node))
        successors = set(G.successors(node))
        predecessors.discard(node)
        successors.discard(node)
        pairs = len(predecessors) * len(successors - predecessors)
        relay_counts[node] = pairs
    return relay_counts


# ─────────────────────────────────────────────
# Step 5 — Suspicious Pattern Detection
# ─────────────────────────────────────────────

def flag_suspicious_patterns(G: nx.DiGraph, max_cycles: int = 20) -> dict:
    """
    Detect three suspicious patterns in the pruned graph:

    1. wash_trade_pairs: Bidirectional edges (A->B and B->A) with
       similar volumes (within 20% of each other).

    2. hub_and_spoke_hubs: Nodes with very high out_degree but low
       in_degree — one source distributing to many receivers.

    3. circular_flows: Simple cycles of length 3-5.
       Capped at max_cycles to avoid expensive enumeration.
    """
    patterns = {
        "wash_trade_pairs": [],
        "hub_and_spoke_hubs": [],
        "circular_flows": [],
    }

    # 1. Wash trade pairs
    seen = set()
    for u, v, data in G.edges(data=True):
        if (v, u) in seen:
            continue
        if G.has_edge(v, u):
            vol_uv = data["total_volume"]
            vol_vu = G[v][u]["total_volume"]
            if vol_uv > 0 and vol_vu > 0:
                ratio = min(vol_uv, vol_vu) / max(vol_uv, vol_vu)
                if ratio >= 0.80:
                    patterns["wash_trade_pairs"].append([u, v])
            seen.add((u, v))

    # 2. Hub-and-spoke: high out_degree, low in_degree
    for node in G.nodes():
        out_d = G.out_degree(node)
        in_d = G.in_degree(node)
        if out_d >= 10 and in_d <= 2:
            patterns["hub_and_spoke_hubs"].append(node)

    # 3. Circular flows (simple cycles length 3-5)
    cycle_count = 0
    if G.number_of_nodes() < 2000:
        try:
            try:
                # Newer NetworkX versions support length_bound to stop deep recursion
                iterator = nx.simple_cycles(G, length_bound=5)
            except TypeError:
                iterator = nx.simple_cycles(G)
                
            for cycle in iterator:
                if cycle_count >= max_cycles:
                    break
                if 3 <= len(cycle) <= 5:
                    patterns["circular_flows"].append(cycle)
                    cycle_count += 1
        except Exception:
            pass

    return patterns


# ─────────────────────────────────────────────
# Step 6 — Path Tracing (optional)
# ─────────────────────────────────────────────

def trace_path(G: nx.DiGraph, source: str, target: str) -> dict:
    """
    Find the shortest directed path between two wallets.
    Returns path with per-hop edge metadata, or error if no path exists.
    """
    try:
        path = nx.shortest_path(G, source=source, target=target)
        legs = []
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge_data = G[u][v] if G.has_edge(u, v) else {}
            legs.append({
                "from": u,
                "to": v,
                "transfer_count": edge_data.get("transfer_count", 0),
                "total_volume": str(round(edge_data.get("total_volume", 0), 6)),
            })
        return {"path": path, "hops": len(path) - 1, "legs": legs}
    except nx.NetworkXNoPath:
        return {"error": f"No directed path found from {source} to {target}"}
    except nx.NodeNotFound as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────

def compute_deep_analysis(
    token_address: str,
    min_transfer_count: int = 3,
    min_edge_volume_pct: float = 0.001,
    min_degree: int = 2,
    min_community_size: int = 3,
    path_source: str = None,
    path_target: str = None,
) -> dict:
    """
    Full deep network analysis pipeline for a token.
    """
    meta = get_token_metadata(token_address)
    chain = meta.get("chain", "ethereum")
    
    edges_df = get_aggregated_edges_for_token(token_address, chain)
    balances = get_wallet_balances(token_address, edges_df)

    if edges_df.empty:
        return {"error": f"No transfers found for token {token_address}"}

    balance_map = (
        balances.set_index("wallet_address")[["balance", "balance_pct"]].to_dict("index")
        if not balances.empty else {}
    )

    # Gather names
    address_names = {}
    for row in edges_df.itertuples(index=False):
        fname = getattr(row, "from_address_name", None)
        tname = getattr(row, "to_address_name", None)
        if pd.notna(fname):
            address_names[row.from_address] = fname
        if pd.notna(tname):
            address_names[row.to_address] = tname

    print("DEBUG: Starting build_full_graph")
    # Build and filter graph
    G = build_full_graph(edges_df)
    raw_node_count = G.number_of_nodes()
    raw_edge_count = G.number_of_edges()

    G = apply_edge_threshold(G, min_transfer_count, min_edge_volume_pct)
    G = apply_node_threshold(G, min_degree)

    if G.number_of_nodes() == 0:
        return {
            "error": "No nodes remain after applying thresholds. Try lowering min_transfer_count or min_edge_volume_pct.",
            "raw_node_count": raw_node_count,
            "raw_edge_count": raw_edge_count,
        }

    # Compute metrics
    centrality = compute_centrality_metrics(G)
    relay_counts = compute_relay_counts(G)

    # Community detection
    raw_communities = (
        community_louvain.best_partition(G.to_undirected())
        if G.number_of_nodes() > 0 else {}
    )
    communities = apply_community_threshold(raw_communities, min_community_size)

    # Suspicious patterns
    suspicious = flag_suspicious_patterns(G)

    # Assemble nodes
    nodes = []
    wash_wallets = {addr for pair in suspicious["wash_trade_pairs"] for addr in pair}
    circular_wallets = {w for cycle in suspicious["circular_flows"] for w in cycle}

    for wallet in G.nodes():
        bal = balance_map.get(wallet, {"balance": 0.0, "balance_pct": 0.0})
        bal_pct = float(bal["balance_pct"])
        c = centrality.get(wallet, {})
        relay = relay_counts.get(wallet, 0)

        if c.get("betweenness", 0) >= 0.01:
            wtype = "hub"
        elif wallet in suspicious["hub_and_spoke_hubs"]:
            wtype = "distributor"
        else:
            wtype = classify_wallet(bal_pct)

        flags = []
        if wallet in wash_wallets:
            flags.append("wash_trade")
        if wallet in suspicious["hub_and_spoke_hubs"]:
            flags.append("hub_and_spoke")
        if wallet in circular_wallets:
            flags.append("circular_flow")
        if c.get("betweenness", 0) >= 0.01:
            flags.append("high_betweenness")

        total_txs_made = sum(d.get("transfer_count", 0) for _, _, d in G.out_edges(wallet, data=True))
        total_txs_received = sum(d.get("transfer_count", 0) for _, _, d in G.in_edges(wallet, data=True))
        total_vol_received = sum(d.get("total_volume", 0.0) for _, _, d in G.in_edges(wallet, data=True))
        total_vol_sent = sum(d.get("total_volume", 0.0) for _, _, d in G.out_edges(wallet, data=True))

        nodes.append({
            "id": wallet,
            "name": address_names.get(wallet),
            "balance": str(round(float(bal["balance"]), 6)),
            "balance_pct": round(bal_pct, 6),
            "pagerank": c.get("pagerank", 0),
            "betweenness": c.get("betweenness", 0),
            "in_degree": c.get("in_degree", 0),
            "out_degree": c.get("out_degree", 0),
            "unique_wallets_in": c.get("in_degree", 0),
            "unique_wallets_out": c.get("out_degree", 0),
            "total_volume_in": str(round(float(total_vol_received), 6)),
            "total_volume_out": str(round(float(total_vol_sent), 6)),
            "total_txs_made": total_txs_made,
            "total_txs_received": total_txs_received,
            "relay_count": relay,
            "community_id": communities.get(wallet, -1),
            "wallet_type": wtype,
            "flags": flags,
        })

    # Assemble edges
    edges = []
    for src, tgt, data in G.edges(data=True):
        edges.append({
            "source": src,
            "target": tgt,
            "transfer_count": data.get("transfer_count", 0),
            "total_volume": str(round(data.get("total_volume", 0), 6)),
            "bidirectional": G.has_edge(tgt, src),
        })

    # Community summaries
    community_map = {}
    for wallet, cid in communities.items():
        if cid == -1:
            continue
        bal_pct = float(balance_map.get(wallet, {"balance_pct": 0})["balance_pct"])
        if cid not in community_map:
            community_map[cid] = {"community_id": cid, "wallet_count": 0,
                                   "total_balance_pct": 0.0, "top_wallets": []}
        community_map[cid]["wallet_count"] += 1
        community_map[cid]["total_balance_pct"] += bal_pct
        community_map[cid]["top_wallets"].append((wallet, bal_pct))

    communities_list = []
    for cid, d in community_map.items():
        top = sorted(d["top_wallets"], key=lambda x: x[1], reverse=True)[:5]
        bp = d["total_balance_pct"]
        label = "coordinated_whale" if bp > 20 else "exchange_cluster" if bp > 5 else "retail_cluster"
        communities_list.append({
            "community_id": cid,
            "wallet_count": d["wallet_count"],
            "balance_pct": round(bp, 4),
            "label": label,
            "top_wallets": [w for w, _ in top],
        })
    communities_list.sort(key=lambda x: x["balance_pct"], reverse=True)

    # Optional path tracing
    path_result = None
    if path_source and path_target:
        path_result = trace_path(G, path_source.lower(), path_target.lower())

    meta = get_token_metadata(token_address)

    return {
        "token_address": token_address,
        "token_name": meta.get("name"),
        "token_symbol": meta.get("symbol"),
        "logo_url": meta.get("logo_url"),
        "chain": meta.get("chain"),
        "raw_node_count": raw_node_count,
        "raw_edge_count": raw_edge_count,
        "total_wallets": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "thresholds_applied": {
            "min_transfer_count": min_transfer_count,
            "min_edge_volume_pct": min_edge_volume_pct,
            "min_degree": min_degree,
            "min_community_size": min_community_size,
        },
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "nodes": nodes,
        "edges": edges,
        "communities": communities_list,
        "suspicious_patterns": suspicious,
        "path": path_result,
    }
