#!/usr/bin/env bash
# deploy-testnet.sh — Deploy TilesBot NFT contract to Casper Testnet
# Usage: ./scripts/deploy-testnet.sh
set -euo pipefail

# -- Configuration
SECRET_KEY="${CASPER_SECRET_KEY:-$HOME/.casper/testnet-deploy-key/secret_key.pem}"
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
CHAIN_NAME="${CASPER_CHAIN_NAME:-casper-test}"
WASM_PATH="../wasm/TilesBotNft.wasm"
GAS_PRICE_TOLERANCE="${GAS_PRICE_TOLERANCE:-10}"

# Init args (these must be set for your deployment)
WCSPR_CONTRACT="${WCSPR_CONTRACT:?Set WCSPR_CONTRACT to the testnet wCSPR contract hash}"
TREASURY_PUBKEY="${TREASURY_PUBKEY:-$(cat $HOME/.casper/testnet-deploy-key/public_key_hex)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== TilesBot NFT Testnet Deployment ==="
echo "Node:    $NODE_ADDRESS"
echo "Chain:   $CHAIN_NAME"
echo "Key:     $SECRET_KEY"
echo "WASM:    $WASM_PATH"
echo "wCSPR:   $WCSPR_CONTRACT"
echo "Treasury: $TREASURY_PUBKEY"
echo ""

# Verify WASM exists
if [ ! -f "$WASM_PATH" ]; then
    echo "ERROR: WASM not found at $WASM_PATH"
    echo "Run 'cargo odra build' first."
    exit 1
fi

WASM_SIZE=$(wc -c < "$WASM_PATH")
echo "WASM size: $WASM_SIZE bytes"

# Check account balance
echo ""
echo "Checking account balance..."
casper-client query-balance \
    --node-address "$NODE_ADDRESS" \
    --purse-identifier "$TREASURY_PUBKEY" 2>&1 || {
    echo "WARNING: Could not query balance. Account may not be funded yet."
    echo "Fund via: https://testnet.cspr.live/tools/faucet"
    echo "Public key: $TREASURY_PUBKEY"
    exit 1
}

# Deploy the contract
echo ""
echo "Deploying contract..."
casper-client put-txn session \
    --node-address "$NODE_ADDRESS" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$SECRET_KEY" \
    --wasm-path "$WASM_PATH" \
    --gas-price-tolerance "$GAS_PRICE_TOLERANCE" \
    --payment-amount 250000000000 \
    --standard-payment true \
    --install-upgrade \
    --session-args-json '[
        {"name": "name", "type": "String", "value": "TilesBot"},
        {"name": "symbol", "type": "String", "value": "TILE"},
        {"name": "wcspr_address", "type": "Key", "value": "'"$WCSPR_CONTRACT"'"},
        {"name": "treasury", "type": "Key", "value": "account-hash-'"$(casper-client account-address --public-key "$TREASURY_PUBKEY" 2>/dev/null | grep -oP '[a-f0-9]{64}' || echo 'UNKNOWN')"'"},
        {"name": "contract_name", "type": {"Option": "String"}, "value": "TilesBot Grid"},
        {"name": "contract_description", "type": {"Option": "String"}, "value": "AI Agent Grid on Casper"},
        {"name": "contract_icon_uri", "type": {"Option": "String"}, "value": "https://tiles.bot/icon.png"},
        {"name": "contract_project_uri", "type": {"Option": "String"}, "value": "https://tiles.bot"}
    ]' \
    2>&1

echo ""
echo "Deploy transaction submitted! Check status on https://testnet.cspr.live"
echo "Use the deploy hash above to track the transaction."
