#!/usr/bin/env bash
# test-mint.sh — Test minting on the deployed testnet contract
# Usage: ./scripts/test-mint.sh <contract-hash> <wcspr-hash>
set -euo pipefail

CONTRACT_HASH="${1:?Usage: $0 <contract-hash> <wcspr-hash>}"
WCSPR_HASH="${2:?Usage: $0 <contract-hash> <wcspr-hash>}"
SECRET_KEY="${CASPER_SECRET_KEY:-$HOME/.casper/testnet-deploy-key/secret_key.pem}"
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
CHAIN_NAME="${CASPER_CHAIN_NAME:-casper-test}"
GAS_PRICE_TOLERANCE="${GAS_PRICE_TOLERANCE:-10}"

echo "=== Test Mint on TilesBot NFT ==="
echo "Contract: $CONTRACT_HASH"
echo "wCSPR:    $WCSPR_HASH"

# Step 1: Check current price
echo ""
echo "1. Querying current_price..."
casper-client put-txn session \
    --node-address "$NODE_ADDRESS" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$SECRET_KEY" \
    --wasm-path "" \
    --session-entry-point "current_price" \
    --gas-price-tolerance "$GAS_PRICE_TOLERANCE" \
    --payment-amount 1000000000 \
    2>&1 || echo "(Query via session not supported - check via global state)"

# Step 2: Approve wCSPR spending
echo ""
echo "2. Approving wCSPR for NFT contract..."
casper-client put-txn session \
    --node-address "$NODE_ADDRESS" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$SECRET_KEY" \
    --wasm-path "" \
    --session-entry-point "approve" \
    --gas-price-tolerance "$GAS_PRICE_TOLERANCE" \
    --payment-amount 5000000000 \
    --session-args-json '[
        {"name": "spender", "type": "Key", "value": "'"$CONTRACT_HASH"'"},
        {"name": "amount", "type": "U256", "value": "1000000000000"}
    ]' \
    2>&1

echo ""
echo "3. After approval settles, claim tile #42..."
echo "   casper-client put-txn session \\"
echo "     --session-entry-point claim \\"
echo "     --session-args-json '[{"name":"token_id","type":"U256","value":"42"}]'"
echo ""
echo "NOTE: This is a manual test flow. Each step requires waiting for the previous transaction to finalize."
