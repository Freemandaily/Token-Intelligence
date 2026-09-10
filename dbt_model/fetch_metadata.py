#!/usr/bin/env python3
import os
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from web3 import Web3
from eth_abi import decode

# RPC Endpoints Configuration
RPC_URLS = {
    'ethereum': 'https://ethereum-rpc.publicnode.com',
    'bsc': 'https://bsc-rpc.publicnode.com',
    'base': 'https://mainnet.base.org',
    'arbitrum': 'https://arb1.arbitrum.io/rpc',
    'optimism': 'https://mainnet.optimism.io'
}

# Etherscan Chain IDs for V2 API
ETHERSCAN_CHAIN_IDS = {
    'ethereum': 1,
    'bsc': 56,
    'base': 8453,
    'arbitrum': 42161,
    'optimism': 10
}

# Multicall3 contract address (same on all EVM chains)
MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11"

# Multicall3 tryAggregate ABI
MULTICALL_ABI = [
    {
        "inputs": [
            {"internalType": "bool", "name": "requireSuccess", "type": "bool"},
            {
                "components": [
                    {"internalType": "address", "name": "target", "type": "address"},
                    {"internalType": "bytes", "name": "callData", "type": "bytes"}
                ],
                "internalType": "struct Multicall3.Call[]",
                "name": "calls",
                "type": "tuple[]"
            }
        ],
        "name": "tryAggregate",
        "outputs": [
            {
                "components": [
                    {"internalType": "bool", "name": "success", "type": "bool"},
                    {"internalType": "bytes", "name": "returnData", "type": "bytes"}
                ],
                "internalType": "struct Multicall3.Result[]",
                "name": "returnData",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "payable",
        "type": "function"
    }
]

def load_env():
    """Load configuration from indexer's .env file."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.abspath(os.path.join(script_dir, "../indexer/pipe/.env"))
    env = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    return env

def get_db_engine():
    """Create database connection engine."""
    env = load_env()
    db_name = env.get("DB_NAME", "squid")
    db_port = env.get("DB_PORT", "23798")
    db_user = "postgres"
    db_pass = "postgres"  # Defined in docker-compose.yml
    db_host = "localhost"
    
    conn_str = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    return create_engine(conn_str)

def setup_database_tables(engine):
    """Ensure dim_tokens and dim_contracts tables exist in Postgres."""
    print("Setting up database tables if they do not exist...")
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_tokens (
                token_address VARCHAR(42) PRIMARY KEY,
                name VARCHAR(255),
                symbol VARCHAR(50),
                decimals INTEGER,
                total_supply NUMERIC,
                supply_source VARCHAR(50),
                chain VARCHAR(50),
                logo_url VARCHAR(500)
            );
        """))
        
        # Check if dim_tokens lacks the 'logo_url' column
        logo_col_exists_res = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'dim_tokens' AND column_name = 'logo_url'
            );
        """))
        if not logo_col_exists_res.scalar():
            print("  Adding logo_url column to dim_tokens...")
            conn.execute(text("ALTER TABLE dim_tokens ADD COLUMN logo_url VARCHAR(500);"))
        
        # Check if dim_contracts exists using system schemas
        table_exists_res = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'dim_contracts'
            );
        """))
        table_exists = table_exists_res.scalar()
        
        recreate_table = False
        if table_exists:
            # Check if it lacks the 'chain' column
            chain_col_exists_res = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'dim_contracts' AND column_name = 'chain'
                );
            """))
            chain_col_exists = chain_col_exists_res.scalar()
            if not chain_col_exists:
                recreate_table = True
        
        if recreate_table:
            print("  Recreating dim_contracts to include chain column...")
            conn.execute(text("DROP TABLE IF EXISTS dim_contracts;"))
            
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dim_contracts (
                address VARCHAR(42),
                chain VARCHAR(50),
                is_contract BOOLEAN,
                contract_name VARCHAR(255),
                fetched_at TIMESTAMP WITH TIME ZONE,
                PRIMARY KEY (address, chain)
            );
        """))
        conn.commit()

def decode_evm_string(data_bytes):
    """Helper to safely decode EVM string or bytes32 formats."""
    if not data_bytes or len(data_bytes) == 0:
        return None
    try:
        # Standard EVM string format
        return decode(['string'], data_bytes)[0].strip('\x00').strip()
    except Exception:
        try:
            # Fallback to bytes32 nul-terminated decoding
            return data_bytes.decode('utf-8', errors='ignore').strip('\x00').strip()
        except Exception:
            return None

def fetch_geckoterminal_logo(token_address, chain):
    """Fetch token logo URL from GeckoTerminal API."""
    gt_chain = chain.lower()
    if gt_chain == 'ethereum':
        gt_chain = 'eth'
    # Base and Arbitrum are usually 'base' and 'arbitrum' in GT. BSC is 'bsc'. Optimism is 'optimism'.
    url = f"https://api.geckoterminal.com/api/v2/networks/{gt_chain}/tokens/{token_address}?include=top_pools&include_composition=false&include_inactive_source=false"
    try:
        res = requests.get(url, timeout=5)
        if res.status_code == 429:
            print(f"   [Warning] GeckoTerminal rate limit hit for {token_address}. Retrying in 15s...")
            time.sleep(15)
            res = requests.get(url, timeout=5)
            
        if res.status_code == 200:
            data = res.json()
            attributes = data.get('data', {}).get('attributes', {})
            return attributes.get('image_url') or attributes.get('banner_image_url')
        else:
            print(f"   [Warning] GeckoTerminal returned {res.status_code} for {token_address}")
    except Exception as e:
        print(f"   [Warning] Failed to fetch logo for {token_address} from GeckoTerminal: {e}")
    return None

def fetch_token_metadata_chunk(w3, multicall_contract, token_chunk):
    """Fetch metadata for a chunk of tokens using tryAggregate."""
    calls = []
    # 4 calls per token: name(), symbol(), decimals(), totalSupply()
    for token in token_chunk:
        checksum_addr = Web3.to_checksum_address(token)
        calls.append({"target": checksum_addr, "callData": b"\x06\xfd\xde\x03"}) # name()
        calls.append({"target": checksum_addr, "callData": b"\x95\xd8\x9b\x41"}) # symbol()
        calls.append({"target": checksum_addr, "callData": b"\x31\x3c\xe5\x67"}) # decimals()
        calls.append({"target": checksum_addr, "callData": b"\x18\x16\x0d\xdd"}) # totalSupply()
        
    try:
        results = multicall_contract.functions.tryAggregate(False, calls).call()
    except Exception as e:
        print(f"   [Error] tryAggregate call failed: {e}")
        return {}

    metadata_map = {}
    for i, token in enumerate(token_chunk):
        res_idx = i * 4
        name_res = results[res_idx]
        symbol_res = results[res_idx + 1]
        decimals_res = results[res_idx + 2]
        supply_res = results[res_idx + 3]
        
        # We check if decimals and totalSupply calls succeeded at minimum
        if decimals_res[0] and supply_res[0]:
            try:
                name = decode_evm_string(name_res[1])
                symbol = decode_evm_string(symbol_res[1])
                decimals = decode(['uint256'], decimals_res[1])[0]
                total_supply = decode(['uint256'], supply_res[1])[0]
                
                metadata_map[token] = {
                    "name": name or "Unknown",
                    "symbol": symbol or "UNKNOWN",
                    "decimals": int(decimals),
                    "total_supply": float(total_supply)
                }
            except Exception as e:
                print(f"   [Warning] Failed to decode metadata for token {token}: {e}")
                
    return metadata_map

def get_contract_name_from_etherscan(address, chain_name, api_key):
    """Query Etherscan API V2 to retrieve verified contract names."""
    if not api_key or chain_name not in ETHERSCAN_CHAIN_IDS:
        return None
    chain_id = ETHERSCAN_CHAIN_IDS[chain_name]
    url = f"https://api.etherscan.io/v2/api?module=contract&action=getsourcecode&address={address}&chainid={chain_id}&apikey={api_key}"
    try:
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get('status') == '1' and isinstance(data.get('result'), list) and len(data['result']) > 0:
                name = data['result'][0].get('ContractName')
                if name and name.strip():
                    return name.strip()
    except Exception as e:
        print(f"   Etherscan contract metadata query failed: {e}")
    return None

def check_is_contract_batch(rpc_url, addresses):
    """Check if a list of addresses are contracts using a JSON-RPC batch request."""
    payload = []
    for i, addr in enumerate(addresses):
        payload.append({
            "jsonrpc": "2.0",
            "method": "eth_getCode",
            "params": [Web3.to_checksum_address(addr), "latest"],
            "id": i
        })
    headers = {"Content-Type": "application/json"}
    is_contract_map = {addr: False for addr in addresses}
    try:
        res = requests.post(rpc_url, json=payload, headers=headers, timeout=15)
        if res.status_code == 200:
            responses = res.json()
            if isinstance(responses, list):
                for resp in responses:
                    resp_id = resp.get('id')
                    if resp_id is not None and resp_id < len(addresses):
                        addr = addresses[resp_id]
                        result = resp.get('result', '0x')
                        is_contract_map[addr] = (result != '0x' and len(result) > 2)
    except Exception as e:
        print(f"   Batch getCode failed: {e}")
    return is_contract_map

def main():
    engine = get_db_engine()
    setup_database_tables(engine)
    
    env = load_env()
    etherscan_key = env.get("ETHERSCAN_API_KEY", "8TSUD2IHRGJ4ITVIAYEXNCAWE1ZV3U9J4I")
    
    # 1. Load existing resolved tokens and accounts
    print("\nReading existing database state...")
    with engine.connect() as conn:
        # Load unique tokens and chains from transfers
        result_transfers = conn.execute(text("SELECT DISTINCT lower(token_address), lower(chain) FROM transfer;"))
        transfers_tokens = [(row[0], row[1]) for row in result_transfers]
        
        # Load unique accounts from transfers (from and to)
        result_accounts_from = conn.execute(text("SELECT DISTINCT lower(from_id), lower(chain) FROM transfer;"))
        result_accounts_to = conn.execute(text("SELECT DISTINCT lower(to_id), lower(chain) FROM transfer;"))
        accounts_to_check = set(result_accounts_from).union(set(result_accounts_to))
        
        # Load existing resolved records (only consider fully resolved if they have a logo)
        res_tokens = conn.execute(text("SELECT lower(token_address) FROM dim_tokens WHERE logo_url IS NOT NULL;"))
        existing_tokens = {row[0] for row in res_tokens}
        
        res_contracts = conn.execute(text("SELECT lower(address), lower(chain) FROM dim_contracts;"))
        existing_contracts = {(row[0], row[1]) for row in res_contracts}

    print(f"Found {len(transfers_tokens)} unique tokens, {len(accounts_to_check)} unique accounts in transfers.")
    print(f"Already resolved: {len(existing_tokens)} tokens, {len(existing_contracts)} contracts/EOAs.")

    # 2. Filter missing tokens by chain
    missing_tokens_by_chain = {}
    for token, chain in transfers_tokens:
        if token not in existing_tokens:
            missing_tokens_by_chain.setdefault(chain, []).append(token)
            
    # 3. Filter missing accounts by chain
    missing_accounts_by_chain = {}
    for addr, chain in accounts_to_check:
        if (addr, chain) not in existing_contracts:
            missing_accounts_by_chain.setdefault(chain, []).append(addr)

    # 4. Resolve Token Metadata
    print("\n--- Resolving Token Metadata ---")
    for chain, tokens in missing_tokens_by_chain.items():
        if chain not in RPC_URLS:
            print(f"Skipping unsupported chain: {chain}")
            continue
            
        print(f"Fetching metadata for {len(tokens)} tokens on {chain}...")
        w3 = Web3(Web3.HTTPProvider(RPC_URLS[chain]))
        multicall_contract = w3.eth.contract(address=Web3.to_checksum_address(MULTICALL_ADDRESS), abi=MULTICALL_ABI)
        
        # Chunk requests to avoid hitting RPC limit thresholds
        chunk_size = 20
        for i in range(0, len(tokens), chunk_size):
            chunk = tokens[i:i+chunk_size]
            metadata = fetch_token_metadata_chunk(w3, multicall_contract, chunk)
            
            # Write to database
            if metadata:
                with engine.begin() as conn:
                    for addr, info in metadata.items():
                        logo_url = fetch_geckoterminal_logo(addr, chain)
                        conn.execute(text("""
                            INSERT INTO dim_tokens (token_address, name, symbol, decimals, total_supply, supply_source, chain, logo_url)
                            VALUES (:addr, :name, :symbol, :decimals, :total_supply, :source, :chain, :logo_url)
                            ON CONFLICT (token_address) DO UPDATE 
                            SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, decimals = EXCLUDED.decimals, total_supply = EXCLUDED.total_supply, logo_url = COALESCE(EXCLUDED.logo_url, dim_tokens.logo_url);
                        """), {
                            "addr": addr,
                            "name": info["name"],
                            "symbol": info["symbol"],
                            "decimals": info["decimals"],
                            "total_supply": info["total_supply"],
                            "source": "onchain",
                            "chain": chain,
                            "logo_url": logo_url
                        })
                        time.sleep(3) # Strict 20 req/min for GeckoTerminal to avoid 429
                print(f"  Saved metadata for {len(metadata)} tokens.")
            time.sleep(1)

    # 5. Resolve Accounts/Contracts Metadata
    print("\n--- Resolving Account & Contract Type Metadata ---")
    for chain, accounts in missing_accounts_by_chain.items():
        if chain not in RPC_URLS:
            continue
            
        print(f"Resolving {len(accounts)} accounts on {chain}...")
        rpc_url = RPC_URLS[chain]
        
        # Batch query in chunks of 200 to check which are contracts
        chunk_size = 200
        for i in range(0, len(accounts), chunk_size):
            chunk = accounts[i:i+chunk_size]
            
            # 1. Fetch is_contract map for this chunk
            is_contract_map = check_is_contract_batch(rpc_url, chunk)
            
            # 2. Process contracts concurrently (~3 req/sec)
            contracts = [addr for addr in chunk if is_contract_map.get(addr, False)]
            
            def process_contract(addr):
                try:
                    contract_name = get_contract_name_from_etherscan(addr, chain, etherscan_key)
                    print(f"  + Contract found: {addr} ({contract_name or 'Unverified/Unnamed'})")
                    
                    if contract_name:
                        with engine.begin() as conn:
                            conn.execute(text("""
                                INSERT INTO dim_contracts (address, chain, is_contract, contract_name, fetched_at)
                                VALUES (:addr, :chain, :is_contract, :contract_name, :fetched_at)
                                ON CONFLICT (address, chain) DO UPDATE 
                                SET is_contract = EXCLUDED.is_contract, contract_name = EXCLUDED.contract_name, fetched_at = EXCLUDED.fetched_at;
                            """), {
                                "addr": addr,
                                "chain": chain,
                                "is_contract": True,
                                "contract_name": contract_name,
                                "fetched_at": datetime.now(timezone.utc)
                            })
                except Exception as e:
                    print(f"  [Warning] Failed to resolve contract {addr}: {e}")
                finally:
                    # Enforce rate limit per thread (3 workers * 1 sec sleep = ~3 req/s)
                    time.sleep(1.0)
            
            if contracts:
                with ThreadPoolExecutor(max_workers=3) as executor:
                    list(executor.map(process_contract, contracts))
            
    print("\nMetadata sync finished successfully!")

if __name__ == "__main__":
    main()
