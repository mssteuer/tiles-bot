#!/usr/bin/env bash
# deploy-devnet.sh -- Deploy TilesBot NFT to local casper-devnet for integration testing
#
# Usage:
#   ./scripts/deploy-devnet.sh              # start devnet + deploy + test
#   ./scripts/deploy-devnet.sh --no-start   # deploy to already-running devnet
#
# Prerequisites: casper-devnet installed (cargo install casper-devnet --locked)
#
# IMPORTANT: Odra contracts CANNOT be deployed via raw casper-client put-txn.
# Odra uses a custom dispatcher format (error 64658 if you try casper-client).
# This script uses the Odra livenet framework (cargo test --test deploy_livenet).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/.."
NETWORK_NAME="${DEVNET_NETWORK_NAME:-tiles-devnet}"
START_DEVNET=true

if [ "${1:-}" = "--no-start" ]; then
    START_DEVNET=false
fi

cd "$CONTRACT_DIR"

# -- Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "================================="
echo " TilesBot NFT Devnet Deployment"
echo "================================="

# -- Pre-flight
which casper-devnet >/dev/null 2>&1 || fail "casper-devnet not found. Install: cargo install casper-devnet --locked"
[ -f "wasm/TilesBotNft.wasm" ] || fail "WASM not found. Run 'cargo odra build' first."
[ -f "wasm/MockWcspr.wasm" ] || fail "MockWcspr.wasm not found. Run 'cargo odra build' first."
ok "WASM artifacts: TilesBotNft.wasm ($(wc -c < wasm/TilesBotNft.wasm) bytes), MockWcspr.wasm ($(wc -c < wasm/MockWcspr.wasm) bytes)"

# -- Start devnet (4 nodes required for consensus)
if [ "$START_DEVNET" = true ]; then
    echo ""
    echo "-- Starting casper-devnet ($NETWORK_NAME) --"
    # Clean up any existing network
    casper-devnet networks delete "$NETWORK_NAME" 2>/dev/null || true

    # Start in background (blocks until shutdown)
    casper-devnet start --network-name "$NETWORK_NAME" --node-count 4 --users 3 &
    DEVNET_PID=$!

    # Wait for Validate state (blocks being produced)
    echo "Waiting for devnet to reach Validate state..."
    for i in $(seq 1 60); do
        sleep 3
        STATUS=$(curl -s -X POST http://127.0.0.1:11101/rpc \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' 2>/dev/null | \
            python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('reactor_state',''))" 2>/dev/null || echo "")
        if [ "$STATUS" = "Validate" ]; then
            ok "Devnet producing blocks (attempt $i)"
            break
        fi
        if [ "$i" -eq 60 ]; then
            fail "Devnet did not reach Validate state after 3 minutes"
        fi
    done
else
    echo "Skipping devnet start (--no-start)"
    # Verify devnet is running
    STATUS=$(curl -s -X POST http://127.0.0.1:11101/rpc \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' 2>/dev/null | \
        python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('result',{}).get('reactor_state',''))" 2>/dev/null || echo "")
    [ "$STATUS" = "Validate" ] || fail "Devnet not in Validate state (got: $STATUS)"
    ok "Devnet is running"
fi

# -- Get chain name from the running devnet
CHAIN_NAME=$(curl -s -X POST http://127.0.0.1:11101/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' | \
    python3 -c "import json,sys; print(json.load(sys.stdin)['result']['chainspec_name'])")
ok "Chain name: $CHAIN_NAME"

# -- Derive deployment key
echo ""
echo "-- Setting up deployment key --"
mkdir -p /tmp/devnet-deploy-key
casper-devnet derive --secret-key "m/44'/506'/0'/0/100" -o - | tr -d '\r' > /tmp/devnet-deploy-key/secret_key.pem
DEVNET_PUBKEY=$(casper-devnet derive --public-key "m/44'/506'/0'/0/100" -o - 2>&1)
ok "Deployer: $DEVNET_PUBKEY"

# -- Verify balance
BAL=$(casper-client query-balance \
    --node-address http://127.0.0.1:11101/rpc \
    --purse-identifier "$DEVNET_PUBKEY" 2>&1 | \
    python3 -c "import json,sys; print(json.load(sys.stdin)['result']['balance'])" 2>/dev/null || echo "0")
ok "Balance: $BAL motes"

# -- Deploy via Odra livenet framework
echo ""
echo "-- Deploying via Odra livenet --"
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=/tmp/devnet-deploy-key/secret_key.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=http://127.0.0.1:11101
export ODRA_CASPER_LIVENET_EVENTS_URL=http://127.0.0.1:18101/events
export ODRA_CASPER_LIVENET_CHAIN_NAME="$CHAIN_NAME"

cargo test --test deploy_livenet deploy_and_verify -- --nocapture || fail "Deployment failed"
ok "Contracts deployed!"

echo ""
echo "-- Running mint test --"
cargo test --test deploy_livenet deploy_and_test_mint -- --nocapture || warn "Mint test failed"

echo ""
ok "Devnet deployment complete!"
echo ""
echo "Contract hashes are in the output above."
echo "Devnet nodes are still running. To stop:"
echo "  pkill -f casper-node; pkill -f casper-sidecar"
echo "  casper-devnet networks delete $NETWORK_NAME"
