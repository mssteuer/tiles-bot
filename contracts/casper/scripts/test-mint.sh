#!/usr/bin/env bash
# test-mint.sh — Manual mint test flow for deployed TilesBot NFT
#
# NOTE: This is a TEMPLATE for manual testing. Each step requires waiting
# for the previous transaction to finalize before proceeding.
# For automated testing, use: cargo test --test deploy_livenet deploy_and_test_mint
#
# Usage: ./scripts/test-mint.sh <nft-contract-hash> <wcspr-contract-hash>
set -euo pipefail

CONTRACT_HASH="${1:?Usage: $0 <nft-contract-hash> <wcspr-contract-hash>}"
WCSPR_HASH="${2:?Usage: $0 <nft-contract-hash> <wcspr-contract-hash>}"
SECRET_KEY="${CASPER_SECRET_KEY:-$HOME/.casper/testnet-deploy-key/secret_key.pem}"
# casper-client (unlike Odra) expects the full /rpc path
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
CHAIN_NAME="${CASPER_CHAIN_NAME:-casper-test}"
GAS_PRICE_TOLERANCE="${GAS_PRICE_TOLERANCE:-10}"

echo "=== Test Mint on TilesBot NFT ==="
echo "Contract: $CONTRACT_HASH"
echo "wCSPR:    $WCSPR_HASH"
echo ""
echo "NOTE: This is a manual test template. For automated testing, use:"
echo "  cargo test --test deploy_livenet deploy_and_test_mint -- --nocapture"
echo ""

# Step 1: Check current price via global state query
echo "1. Querying current_price via global state..."
echo "   casper-client query-global-state \\"
echo "     --node-address \"$NODE_ADDRESS\" \\"
echo "     --key \"$CONTRACT_HASH\" \\"
echo "     --query-path \"current_price\""
echo ""

# Step 2: Approve wCSPR spending
echo "2. Approving wCSPR for NFT contract..."
echo "   casper-client put-txn session \\"
echo "     --node-address \"$NODE_ADDRESS\" \\"
echo "     --chain-name \"$CHAIN_NAME\" \\"
echo "     --secret-key \"$SECRET_KEY\" \\"
echo "     --transaction-entry-point \"approve\" \\"
echo "     --transaction-package-hash \"$WCSPR_HASH\" \\"
echo "     --gas-price-tolerance \"$GAS_PRICE_TOLERANCE\" \\"
echo "     --payment-amount 5000000000 \\"
echo "     --session-args-json '[{\"name\":\"spender\",\"type\":\"Key\",\"value\":\"$CONTRACT_HASH\"},{\"name\":\"amount\",\"type\":\"U256\",\"value\":\"1000000000000\"}]'"
echo ""

# Step 3: Claim a tile
echo "3. After approval settles, claim tile #42..."
echo "   casper-client put-txn session \\"
echo "     --node-address \"$NODE_ADDRESS\" \\"
echo "     --chain-name \"$CHAIN_NAME\" \\"
echo "     --secret-key \"$SECRET_KEY\" \\"
echo "     --transaction-entry-point \"claim\" \\"
echo "     --transaction-package-hash \"$CONTRACT_HASH\" \\"
echo "     --gas-price-tolerance \"$GAS_PRICE_TOLERANCE\" \\"
echo "     --payment-amount 50000000000 \\"
echo "     --session-args-json '[{\"name\":\"token_id\",\"type\":\"U256\",\"value\":\"42\"}]'"
echo ""
echo "Each step requires waiting for the previous transaction to finalize."
echo "Monitor at: https://testnet.cspr.live"
