#!/usr/bin/env python3
import os
import sys
import json
import time
import subprocess
from datetime import datetime, timezone, timedelta

# Try importing requests, install if missing
try:
    import requests
except ImportError:
    print("Error: The 'requests' library is required. Install it using 'pip install requests'")
    sys.exit(1)

# Configuration
GECKOTERMINAL_URL = "https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token&include_gt_community_data=false&page=10&duration=24h"
ETHERSCAN_API_KEY = "8TSUD2IHRGJ4ITVIAYEXNCAWE1ZV3U9J4I"

# Chains mapping: GeckoTerminal -> Indexer
CHAIN_MAPPING = {
    'eth': 'ethereum',
    'bsc': 'bsc',
    'base': 'base',
    'arbitrum': 'arbitrum',
    'optimism': 'optimism'
}

# Etherscan Chain IDs for V2 API
ETHERSCAN_CHAIN_IDS = {
    'ethereum': 1,
    'bsc': 56,
    'base': 8453,
    'arbitrum': 42161,
    'optimism': 10
}

# Symbols to skip (WETH, stablecoins, wrapping assets)
SKIP_SYMBOLS = {
    'weth', 'usdc', 'usdt', 'dai', 'wbnb', 'wbtc', 
    'busd', 'usde', 'tusd', 'fdusd', 'wbtc', 'eth'
}

def load_existing_tokens():
    """
    Load existing token addresses from tokens.json (converted to lowercase).
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    tokens_path = os.path.join(script_dir, "tokens.json")
    if not os.path.exists(tokens_path):
        return set()
    try:
        with open(tokens_path, 'r') as f:
            tokens_list = json.load(f)
            return {addr.lower() for addr in tokens_list if isinstance(addr, str)}
    except Exception as e:
        print(f"Warning: Could not read existing tokens from {tokens_path}: {e}")
        return set()

def get_block_by_time(chain_name, timestamp):
    """
    Fetch block number closest to timestamp.
    Tries Etherscan V2 API first (using key), falls back to DefiLlama.
    """
    # 1. Try Etherscan V2 if API key is provided
    if ETHERSCAN_API_KEY and chain_name in ETHERSCAN_CHAIN_IDS:
        chain_id = ETHERSCAN_CHAIN_IDS[chain_name]
        url = f"https://api.etherscan.io/v2/api?module=block&action=getblocknobytime&timestamp={timestamp}&closest=before&chainid={chain_id}&apikey={ETHERSCAN_API_KEY}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if data.get('status') == '1':
                    block_num = data.get('result')
                    if block_num and str(block_num).isdigit():
                        return int(block_num)
                else:
                    # Log message (e.g. Free API coverage restrictions)
                    result_msg = data.get('result', '')
                    if "Free API access is not supported" in result_msg:
                        pass # Silently fall back to DefiLlama
                    else:
                        print(f"   [Info] Etherscan returned info: {result_msg}. Falling back to DefiLlama.")
        except Exception as e:
            print(f"   [Warning] Etherscan request failed: {e}. Falling back to DefiLlama.")

    # 2. Fallback to DefiLlama
    url = f"https://coins.llama.fi/block/{chain_name}/{timestamp}"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            data = res.json()
            height = data.get('height')
            if height:
                return int(height)
    except Exception as e:
        print(f"   [Error] DefiLlama block retrieval failed for {chain_name}: {e}")
    return None

def fetch_trending_pools():
    """
    Fetch trending pools data from GeckoTerminal.
    """
    print("1. Fetching trending pools from GeckoTerminal...")
    headers = {"User-Agent": "Mozilla/5.0 (compatible; TokenIntelligence/1.0)"}
    try:
        res = requests.get(GECKOTERMINAL_URL, headers=headers, timeout=15)
        if res.status_code != 200:
            print(f"Failed to fetch data: {res.status_code} - {res.text}")
            sys.exit(1)
        return res.json()
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)

def parse_included_tokens(included_data):
    """
    Map token ID to its attributes from the 'included' list.
    """
    tokens_map = {}
    for item in included_data:
        if item.get('type') == 'token':
            tokens_map[item['id']] = item.get('attributes', {})
    return tokens_map

def filter_pool(pool, tokens_map, one_month_ago, existing_tokens):
    """
    Filter the pool based on chain support, creation date, and token type.
    Returns (chain_name, token_address, token_symbol, created_at_dt, pool_name) if valid, else None.
    """
    attributes = pool.get('attributes', {})
    relationships = pool.get('relationships', {})
    pool_name = attributes.get('name', 'Unknown')
    
    # 1. Check network
    network_id = relationships.get('network', {}).get('data', {}).get('id')
    if not network_id or network_id not in CHAIN_MAPPING:
        return None
        
    chain_name = CHAIN_MAPPING[network_id]
    
    # 2. Check pool creation time
    pool_created_at = attributes.get('pool_created_at')
    if not pool_created_at:
        return None
        
    try:
        created_at_dt = datetime.fromisoformat(pool_created_at.replace('Z', '+00:00'))
    except Exception:
        # Fallback for older python datetime versions
        created_at_clean = pool_created_at.split('.')[0].rstrip('Z')
        created_at_dt = datetime.strptime(created_at_clean, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)

    # if created_at_dt < one_month_ago:
    #     print(f" - Skipping pool {pool_name} on {chain_name}: created > 1 month ago ({pool_created_at})")
    #     return None
        
    # 3. Get base token details
    base_token_relation = relationships.get('base_token', {}).get('data', {})
    base_token_id = base_token_relation.get('id')
    
    if not base_token_id or base_token_id not in tokens_map:
        return None
        
    token_info = tokens_map[base_token_id]
    token_symbol = token_info.get('symbol', '')
    token_address = token_info.get('address', '')
    
    # 4. Skip if base token is WETH, stablecoin, etc.
    if token_symbol.lower() in SKIP_SYMBOLS:
        print(f" - Skipping pool {pool_name} on {chain_name}: base token {token_symbol} is a skipped asset type")
        return None
        
    # 5. Skip if token is already tracked in tokens.json
    if token_address.lower() in existing_tokens:
        print(f" - Skipping pool {pool_name} on {chain_name}: token {token_address} is already in tokens.json")
        return None
        
    return chain_name, token_address, token_symbol, created_at_dt, pool_name

def run_add_token_script(jobs):
    """
    Run add_token.sh with the collected jobs.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, "add_token.sh")
    
    print(f"\n3. Found {len(jobs)} jobs to execute.")
    cmd = [script_path] + jobs
    print(f"Running command: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True, text=True, cwd=script_dir)
        print("\nScript executed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"\nError: add_token.sh failed with exit code {e.returncode}")
        sys.exit(e.returncode)

def main():
    response_data = fetch_trending_pools()
    tokens_map = parse_included_tokens(response_data.get('included', []))
    existing_tokens = load_existing_tokens()

    now = datetime.now(timezone.utc)
    one_month_ago = now - timedelta(days=100)
    
    jobs = []
    
    print("\n2. Processing and filtering pools...")
    for pool in response_data.get('data', []):
        pool_attributes = pool.get('attributes', {})
        pool_created_at = pool_attributes.get('pool_created_at', '')
        
        filtered = filter_pool(pool, tokens_map, one_month_ago, existing_tokens)
        if not filtered:
            continue
            
        chain_name, token_address, token_symbol, created_at_dt, pool_name = filtered
        print(f" + Found valid pool {pool_name} ({token_symbol}) on {chain_name} created at {pool_created_at}")
        
        # Fetch start block (pool creation block)
        creation_timestamp = int(created_at_dt.timestamp())
        start_block = get_block_by_time(chain_name, creation_timestamp)
        if not start_block:
            print(f"   Error: Could not retrieve start block for pool {pool_name}. Skipping.")
            continue
            
        # Fetch end block (current block head)
        current_timestamp = int(time.time())
        end_block = get_block_by_time(chain_name, current_timestamp)
        if not end_block:
            print(f"   Error: Could not retrieve current block head for {chain_name}. Skipping.")
            continue
            
        if end_block < start_block:
            end_block = start_block
            
        job_arg = f"{start_block}:{end_block}:{chain_name}:{token_address}"
        print(f"   Generated job: {job_arg}")
        jobs.append(job_arg)
        
        time.sleep(0.5)

    if not jobs:
        print("\nNo trending tokens passed all filters. Nothing to add.")
        sys.exit(0)

    run_add_token_script(jobs)

if __name__ == "__main__":
    main()
