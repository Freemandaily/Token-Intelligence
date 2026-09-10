#!/bin/bash

# add_token.sh - Add new tokens and trigger backfill + indexer restart.
# Works across all configured chains.

if [ "$#" -lt 1 ]; then
    echo "Usage (Single Chain): ./add_token.sh <START_BLOCK> <CURRENT_BLOCK> <CHAIN> <TOKEN_ADDRESS_1> [TOKEN_ADDRESS_2] ..."
    echo "Usage (Multi Chain):  ./add_token.sh <START_1>:<END_1>:<CHAIN_1>:<TOKEN_A>,<TOKEN_B> <START_2>:<END_2>:<CHAIN_2>:<TOKEN_C> ..."
    echo "Valid chains: ethereum, base, arbitrum, optimism, bsc"
    exit 1
fi

TOKENS_FILE="tokens.json"
TOKEN_ADDRESSES=()

if [[ "$1" == *":"* ]]; then
    # Multi-chain format: "start:end:chain:token1,token2"
    for arg in "$@"; do
        # Extract the 4th field (tokens) using cut
        tokens_part=$(echo "$arg" | cut -d':' -f4)
        # Split comma-separated tokens
        IFS=',' read -ra ADDR_ARRAY <<< "$tokens_part"
        for addr in "${ADDR_ARRAY[@]}"; do
            TOKEN_ADDRESSES+=($(echo "$addr" | tr '[:upper:]' '[:lower:]'))
        done
    done
else
    # Single-chain format: <START_BLOCK> <CURRENT_BLOCK> <CHAIN> <TOKEN_ADDRESS_1> ...
    if [ "$#" -lt 4 ]; then
        echo "Error: Single chain format requires: <START_BLOCK> <CURRENT_BLOCK> <CHAIN> <TOKEN_ADDRESS_1>"
        exit 1
    fi
    # Get all token addresses starting from the 4th argument onwards
    for arg in "${@:4}"; do
        TOKEN_ADDRESSES+=($(echo "$arg" | tr '[:upper:]' '[:lower:]'))
    done
fi

echo "1. Adding tokens to $TOKENS_FILE..."

# Use Node.js and an env variable to safely append the tokens to the JSON file
NEW_TOKENS="${TOKEN_ADDRESSES[*]}" node -e "
const fs = require('fs');
const file = '$TOKENS_FILE';
const newTokens = process.env.NEW_TOKENS.split(' ');
const tokens = JSON.parse(fs.readFileSync(file));
let modified = false;

for (const token of newTokens) {
    if (token && !tokens.includes(token)) {
        tokens.push(token);
        modified = true;
    }
}

if (modified) {
    fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
    console.log('New tokens added.');
} else {
    console.log('All tokens already present, skipping.');
}
"

# echo "2. Rebuilding the typescript project..."
# npm run build
# if [ $? -ne 0 ]; then
#     echo "ERROR: Project build failed."
#     exit 1
# fi

echo "3. Restarting main indexer..."
docker compose restart processor
if [ $? -ne 0 ]; then
    echo "ERROR: Docker restart failed. Is the container running?"
    exit 1
fi

echo "4. Starting historical backfill..."
# Execute the backfill script with the original arguments passed to add_token.sh
# Our updated backfill.ts handles both single-chain and multi-chain arguments layouts directly.
node --require=dotenv/config lib/backfill.js "$@"

echo ""
echo "Done! Backfill process and live indexer sync are fully updated."
