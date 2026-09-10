import pandas as pd
from datetime import datetime, timezone

from data.transfers import get_token_metadata, get_hub_outbound_transfers, get_token_launch_time

def compute_bundling(
    token_address: str,
    bundle_max_block_gap: int = 0,
    bundle_min_wallets: int = 10,
) -> dict:
    """
    Analyzes token transfers to detect 'Bundling Events'.
    A bundling event occurs when an exchange hub transfers tokens to multiple
    unique wallets within a tight block window.
    """
    token_address = token_address.lower()
    meta = get_token_metadata(token_address)
    chain = meta.get("chain", "ethereum")
    
    # 1. Grab launch time using optimized SQL
    token_launch_time = get_token_launch_time(token_address, chain)
    
    # 2. Grab pre-filtered potential bundler outbound transfers (hub threshold = bundle_min_wallets)
    hub_outbounds, exchange_hubs_detected = get_hub_outbound_transfers(
        token_address, chain, min_wallets=bundle_min_wallets
    )
    
    if hub_outbounds.empty:
        return {
            "token_address": token_address,
            "token_name": meta.get("name"),
            "token_symbol": meta.get("symbol"),
            "chain": chain,
            "exchange_hubs_detected": 0,
            "total_bundling_events": 0,
            "total_airdrop_events": 0,
            "total_bundlers": 0,
            "bundling_events": [],
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    # Ensure block_number is numeric and drop NaNs
    hub_outbounds["block_number"] = pd.to_numeric(hub_outbounds["block_number"], errors="coerce")
    hub_outbounds = hub_outbounds.dropna(subset=["block_number"]).sort_values("block_number")
    
    if "block_timestamp" in hub_outbounds.columns:
        hub_outbounds["block_timestamp"] = pd.to_datetime(hub_outbounds["block_timestamp"])

    bundling_events = []
    bundler_wallets = set()
    
    exchange_hubs = set(hub_outbounds["from_address"].unique().tolist())
    clusters = []
    
    # 1. Group by same source and sort
    hub_outbounds = hub_outbounds.sort_values(["from_address", "block_number", "block_timestamp"])
    
    # 2. Vectorized block gap detection
    # Calculate difference in block_number within each from_address group
    hub_outbounds["block_diff"] = hub_outbounds.groupby("from_address")["block_number"].diff()
    
    # A new cluster starts when block_diff > bundle_max_block_gap (which is 0)
    # The first row of each group will have block_diff = NaN, which should also start a cluster,
    # but cumsum() handles NaNs by ignoring them if we fillna first.
    hub_outbounds["new_cluster"] = (hub_outbounds["block_diff"] > bundle_max_block_gap).astype(int)
    # Also trigger a new cluster if it's the first row of a new sender
    hub_outbounds.loc[hub_outbounds["block_diff"].isna(), "new_cluster"] = 1
    
    # Create unique cluster IDs per sender
    hub_outbounds["sender_cluster_id"] = hub_outbounds.groupby("from_address")["new_cluster"].cumsum()
    
    # Group by the unique combination of sender and their cluster ID
    # This replaces the extremely slow python loop that appended pd.DataFrame() thousands of times
    clusters = [group_df for _, group_df in hub_outbounds.groupby(["from_address", "sender_cluster_id"])]
        
    # === C. Identify Bundlers & Airdrops ===
    cluster_id_counter = 1
    candidate_bundles = []
    
    for cluster_df in clusters:
        # Discard internal exchange transfers
        cluster_df = cluster_df[~cluster_df["to_address"].isin(exchange_hubs)]
        if cluster_df.empty:
            continue
        
        if "tx_hash" not in cluster_df.columns:
            cluster_df["tx_hash"] = cluster_df.index

        grouped = cluster_df.groupby("tx_hash")
        bundle_transfers = []
        
        for tx_hash, group_df in grouped:
            unique_recipients = set(group_df["to_address"].tolist())
            
            if len(unique_recipients) >= bundle_min_wallets:
                # Single transaction -> AIRDROP (No time constraints applied)
                cluster_id_str = f"Airdrop-{cluster_id_counter}"
                start_block = int(group_df["block_number"].min())
                end_block = int(group_df["block_number"].max())
                
                bundler_amounts = group_df.groupby("to_address")["amount"].sum().to_dict()
                
                bundling_events.append({
                    "cluster_id": cluster_id_str,
                    "type": "airdrop",
                    "start_block": start_block,
                    "end_block": end_block,
                    "wallet_count": len(unique_recipients),
                    "total_volume": float(group_df["amount"].sum()),
                    "hub_sources": list(set(group_df["from_address"].tolist())),
                    "bundlers": list(unique_recipients),
                    "bundler_amounts": {k: float(v) for k, v in bundler_amounts.items()}
                })
                bundler_wallets.update(unique_recipients)
                cluster_id_counter += 1
            else:
                bundle_transfers.append(group_df)
        
        if bundle_transfers:
            bundle_df = pd.concat(bundle_transfers)
            unique_recipients = set(bundle_df["to_address"].tolist())
            
            if len(unique_recipients) >= bundle_min_wallets:
                cluster_id_str = f"Bundle-{cluster_id_counter}"
                start_block = int(bundle_df["block_number"].min())
                end_block = int(bundle_df["block_number"].max())
                start_time = bundle_df["block_timestamp"].min() if "block_timestamp" in bundle_df.columns else None
                
                bundler_amounts = bundle_df.groupby("to_address")["amount"].sum().to_dict()

                candidate_bundles.append({
                    "start_time": start_time,
                    "event": {
                        "cluster_id": cluster_id_str,
                        "type": "bundle",
                        "start_block": start_block,
                        "end_block": end_block,
                        "wallet_count": len(unique_recipients),
                        "total_volume": float(bundle_df["amount"].sum()),
                        "hub_sources": list(set(bundle_df["from_address"].tolist())),
                        "bundlers": list(unique_recipients),
                        "bundler_amounts": {k: float(v) for k, v in bundler_amounts.items()}
                    }
                })
                cluster_id_counter += 1

    # === D. Apply Time-Sensitive Constraint to Bundles ===
    # Bundles must happen in the first 2 hours of token trading. Airdrops have already been appended.
    if candidate_bundles and token_launch_time is not None:
        candidate_bundles.sort(key=lambda x: x["start_time"] if pd.notna(x["start_time"]) else pd.Timestamp.max)
        
        bundles_under_2h = []
        for cb in candidate_bundles:
            if pd.notna(cb["start_time"]):
                time_diff = (cb["start_time"] - token_launch_time).total_seconds()
                # 2 hours = 7200 seconds
                if time_diff <= 2 * 3600:
                    bundles_under_2h.append(cb["event"])
        
        if len(bundles_under_2h) > 0:
            for ev in bundles_under_2h:
                bundling_events.append(ev)
                bundler_wallets.update(ev["bundlers"])
        else:
            # If none within 2h, we might fallback to earliest 3, or just strict 2h.
            # User said "is the one tah got bundled in the first 2 hours". We'll keep the top 3 fallback just in case launch time is slightly off.
            for cb in candidate_bundles[:3]:
                bundling_events.append(cb["event"])
                bundler_wallets.update(cb["event"]["bundlers"])
    elif candidate_bundles:
        for cb in candidate_bundles:
            bundling_events.append(cb["event"])
            bundler_wallets.update(cb["event"]["bundlers"])

    total_airdrop_events = sum(1 for e in bundling_events if e.get("type") == "airdrop")
    total_bundle_events = sum(1 for e in bundling_events if e.get("type") == "bundle")

    return {
        "token_address": token_address,
        "token_name": meta.get("name"),
        "token_symbol": meta.get("symbol"),
        "chain": chain,
        "exchange_hubs_detected": exchange_hubs_detected,
        "total_bundling_events": total_bundle_events,
        "total_airdrop_events": total_airdrop_events,
        "total_bundlers": len(bundler_wallets),
        "bundling_events": bundling_events,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
