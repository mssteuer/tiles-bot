#!/usr/bin/env bash
# deploy-odra-livenet.sh — Deploy via Odra's livenet environment
# This uses Odra's built-in deployment mechanism
# Usage: ODRA_CASPER_LIVENET_ENV=casper-test ./scripts/deploy-odra-livenet.sh
set -euo pipefail

# Required env vars for Odra livenet:
# ODRA_CASPER_LIVENET_SECRET_KEY_PATH - path to secret_key.pem
# ODRA_CASPER_LIVENET_NODE_ADDRESS - RPC endpoint  
# ODRA_CASPER_LIVENET_EVENTS_URL - SSE events endpoint
# ODRA_CASPER_LIVENET_CHAIN_NAME - chain name

export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="${ODRA_CASPER_LIVENET_SECRET_KEY_PATH:-$HOME/.casper/testnet-deploy-key/secret_key.pem}"
export ODRA_CASPER_LIVENET_NODE_ADDRESS="${ODRA_CASPER_LIVENET_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
export ODRA_CASPER_LIVENET_EVENTS_URL="${ODRA_CASPER_LIVENET_EVENTS_URL:-https://events.testnet.casper.network/events/main}"
export ODRA_CASPER_LIVENET_CHAIN_NAME="${ODRA_CASPER_LIVENET_CHAIN_NAME:-casper-test}"
export ODRA_CASPER_LIVENET_ENV="${ODRA_CASPER_LIVENET_ENV:-casper-test}"

echo "=== Odra Livenet Deployment ==="
echo "Node:      $ODRA_CASPER_LIVENET_NODE_ADDRESS"
echo "Chain:     $ODRA_CASPER_LIVENET_CHAIN_NAME"
echo "Events:    $ODRA_CASPER_LIVENET_EVENTS_URL"
echo "Key:       $ODRA_CASPER_LIVENET_SECRET_KEY_PATH"
echo ""

cd "$(dirname "$0")/.."
cargo odra test --backend casper "$@"
