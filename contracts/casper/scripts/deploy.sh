#!/usr/bin/env bash
# deploy.sh -- One-command TilesBot NFT deployment for Casper testnet or devnet
#
# Usage:
#   ./scripts/deploy.sh testnet   # deploy to Casper Testnet
#   ./scripts/deploy.sh devnet    # deploy to local casper-devnet
#
# Prerequisites:
#   testnet: funded wallet at ~/.casper/testnet-deploy-key/
#   devnet:  casper-devnet running (4+ nodes)
#
set -euo pipefail

TARGET="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/.."

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
echo " TilesBot NFT Deployment"
echo " Target: $TARGET"
echo "================================="

# -- Configure by target
case "$TARGET" in
    testnet)
        export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="${ODRA_CASPER_LIVENET_SECRET_KEY_PATH:-$HOME/.casper/testnet-deploy-key/secret_key.pem}"
        export ODRA_CASPER_LIVENET_NODE_ADDRESS="${ODRA_CASPER_LIVENET_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
        export ODRA_CASPER_LIVENET_EVENTS_URL="${ODRA_CASPER_LIVENET_EVENTS_URL:-https://events.testnet.casper.network/events/main}"
        export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-test"
        PUBKEY_FILE="$HOME/.casper/testnet-deploy-key/public_key_hex"
        EXPLORER="https://testnet.cspr.live"
        ;;
    devnet)
        export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="${ODRA_CASPER_LIVENET_SECRET_KEY_PATH:-/tmp/devnet-key/secret_key.pem}"
        export ODRA_CASPER_LIVENET_NODE_ADDRESS="${ODRA_CASPER_LIVENET_NODE_ADDRESS:-http://127.0.0.1:11101/rpc}"
        export ODRA_CASPER_LIVENET_EVENTS_URL="${ODRA_CASPER_LIVENET_EVENTS_URL:-http://127.0.0.1:18101/events}"
        export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-devnet"
        PUBKEY_FILE=""
        EXPLORER="(local devnet)"
        ;;
    *)
        fail "Unknown target: $TARGET. Use 'testnet' or 'devnet'."
        ;;
esac

echo ""
echo "Configuration:"
echo "  Key:    $ODRA_CASPER_LIVENET_SECRET_KEY_PATH"
echo "  Node:   $ODRA_CASPER_LIVENET_NODE_ADDRESS"
echo "  Events: $ODRA_CASPER_LIVENET_EVENTS_URL"
echo "  Chain:  $ODRA_CASPER_LIVENET_CHAIN_NAME"
echo ""

# -- Pre-flight checks
echo "-- Pre-flight Checks --"

# 1. Secret key exists
if [ ! -f "$ODRA_CASPER_LIVENET_SECRET_KEY_PATH" ]; then
    fail "Secret key not found: $ODRA_CASPER_LIVENET_SECRET_KEY_PATH"
fi
ok "Secret key exists"

# 2. WASM artifact built
if [ ! -f "wasm/TilesBotNft.wasm" ]; then
    warn "WASM not found. Building..."
    cargo odra build || fail "WASM build failed"
fi
WASM_SIZE=$(wc -c < "wasm/TilesBotNft.wasm")
ok "WASM artifact: $WASM_SIZE bytes"

# 3. Tests pass
echo "Running unit tests..."
cargo test --quiet 2>&1 || fail "Unit tests failed"
ok "All unit tests pass"

# 4. Check balance (testnet only)
if [ "$TARGET" = "testnet" ] && [ -n "$PUBKEY_FILE" ] && [ -f "$PUBKEY_FILE" ]; then
    PUBKEY=$(cat "$PUBKEY_FILE")
    echo "Checking balance for $PUBKEY..."
    BAL_OUTPUT=$(casper-client query-balance \
        --node-address "$ODRA_CASPER_LIVENET_NODE_ADDRESS" \
        --purse-identifier "$PUBKEY" 2>&1) || true
    if echo "$BAL_OUTPUT" | grep -q "Purse not found"; then
        fail "Account not funded. Visit ${EXPLORER}/tools/faucet with Casper Wallet"
    elif echo "$BAL_OUTPUT" | grep -q "balance_value"; then
        BAL=$(echo "$BAL_OUTPUT" | grep -oP '"balance_value"\s*:\s*"\K[0-9]+' || echo "?")
        if [ "$BAL" != "?" ]; then
            BAL_CSPR=$((BAL / 1000000000))
            if [ "$BAL_CSPR" -lt 500 ]; then
                fail "Insufficient balance: ${BAL_CSPR} CSPR (need at least 500)"
            fi
            ok "Balance: ${BAL_CSPR} CSPR"
        fi
    fi
fi

echo ""
echo "-- Deploying via Odra Livenet --"
echo ""

# Deploy using the deploy_livenet test which auto-detects livenet via
# ODRA_CASPER_LIVENET_SECRET_KEY_PATH env var (set above).
# We use cargo test directly because cargo odra test has arg-ordering
# bugs with --nocapture, and the WASM build step is already done above.
cargo test --test deploy_livenet deploy_and_verify -- --nocapture || fail "Deployment failed"

echo ""
ok "Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Note the contract addresses from output above"
echo "  2. Update .env.local with:"
echo "     CHAIN_CASPER_NFT_CONTRACT=<nft-contract-hash>"
echo "     CHAIN_CASPER_PAYMENT_TOKEN=<wcspr-contract-hash>"
echo "  3. Run: ./scripts/verify-deployment.sh <nft-contract-hash>"
echo "  4. Test mint: cargo odra test --backend casper -t deploy_and_test_mint -- --nocapture"
echo ""
echo "Explorer: $EXPLORER"
