#!/usr/bin/env bash
# verify-deployment.sh — Verify the NFT contract deployment on testnet
# Usage: ./scripts/verify-deployment.sh <contract-hash>
set -euo pipefail

CONTRACT_HASH="${1:?Usage: $0 <contract-hash>}"
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"

echo "=== Verifying TilesBot NFT Deployment ==="
echo "Contract: $CONTRACT_HASH"
echo "Node:     $NODE_ADDRESS"
echo ""

# Query contract entity
echo "1. Querying contract entity..."
casper-client get-entity \
    --node-address "$NODE_ADDRESS" \
    --entity-identifier "$CONTRACT_HASH" 2>&1

echo ""
echo "2. Querying contract named keys..."
casper-client query-global-state \
    --node-address "$NODE_ADDRESS" \
    --key "$CONTRACT_HASH" 2>&1

echo ""
echo "3. Checking on testnet explorer..."
echo "   https://testnet.cspr.live/contract/$CONTRACT_HASH"
echo ""
echo "Verification complete."
