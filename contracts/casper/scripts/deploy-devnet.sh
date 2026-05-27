#!/usr/bin/env bash
# deploy-devnet.sh -- Deploy TilesBot NFT to local casper-devnet for integration testing
# Usage: ./scripts/deploy-devnet.sh
set -euo pipefail

# -- Devnet configuration
RPC_URL="${CASPER_RPC_URL:-http://127.0.0.1:11101/rpc}"
CHAIN_NAME="${CASPER_CHAIN_NAME:-tiles-test}"
WASM_PATH="wasm/TilesBotNft.wasm"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== TilesBot NFT Devnet Deployment ==="

# -- Verify WASM
if [ ! -f "$WASM_PATH" ]; then
    echo "ERROR: WASM not found at $WASM_PATH"
    echo "Run 'cargo odra build' first."
    exit 1
fi
echo "WASM: $WASM_PATH ($(wc -c < "$WASM_PATH") bytes)"

# -- Derive user-1 key (deterministic BIP32)
echo ""
echo "Deriving user-1 key..."
USER1_INFO=$(casper-devnet derive --path "m/44'/506'/0'/0/100" --json 2>/dev/null || true)
if [ -z "$USER1_INFO" ]; then
    echo "ERROR: casper-devnet derive failed. Is casper-devnet installed?"
    exit 1
fi

USER1_PUBKEY=$(echo "$USER1_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['public_key_hex'])" 2>/dev/null || true)
USER1_SECRET=$(echo "$USER1_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['secret_key_pem_path'])" 2>/dev/null || true)

if [ -z "$USER1_PUBKEY" ]; then
    echo "ERROR: Could not parse user-1 key from casper-devnet derive"
    echo "Raw output: $USER1_INFO"
    exit 1
fi

echo "User-1 public key: $USER1_PUBKEY"
echo "User-1 secret key: $USER1_SECRET"

# -- Check node health
echo ""
echo "Checking node health..."
NODE_STATUS=$(curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"info_get_status"}' 2>&1)

REACTOR_STATE=$(echo "$NODE_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['reactor_state'])" 2>/dev/null || echo "UNKNOWN")
echo "Node state: $REACTOR_STATE"

if [ "$REACTOR_STATE" != "Validate" ]; then
    echo "ERROR: Node not in Validate state (current: $REACTOR_STATE)"
    echo "Wait for the devnet to finish initialization."
    exit 1
fi

# -- Check balance
echo ""
echo "Checking user-1 balance..."
casper-client query-balance \
    --node-address "$RPC_URL" \
    --purse-identifier "$USER1_PUBKEY" 2>&1

# -- Deploy contract
echo ""
echo "Deploying TilesBot NFT..."

# For devnet, we use a dummy wCSPR address (account-hash of user-2)
# Real deployment would use actual wCSPR contract hash
TREASURY_PUBKEY="$USER1_PUBKEY"
DUMMY_WCSPR="account-hash-358d0e47ba935214c76da48e07b6920fbd39881dba74e17cdd6bf71637fbca1b"

casper-client put-txn session \
    --node-address "$RPC_URL" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$USER1_SECRET" \
    --wasm-path "$WASM_PATH" \
    --gas-price-tolerance 10 \
    --payment-amount 250000000000 \
    --install-upgrade \
    --session-args-json '[
        {"name": "name", "type": "String", "value": "TilesBot"},
        {"name": "symbol", "type": "String", "value": "TILE"},
        {"name": "wcspr_address", "type": "Key", "value": "'"$DUMMY_WCSPR"'"},
        {"name": "treasury", "type": "Key", "value": "account-hash-'"$(casper-client account-address --public-key "$TREASURY_PUBKEY" 2>/dev/null | grep -oP '[a-f0-9]{64}' || echo 'UNKNOWN')"'"},
        {"name": "contract_name", "type": {"Option": "String"}, "value": "TilesBot Grid"},
        {"name": "contract_description", "type": {"Option": "String"}, "value": "AI Agent Grid on Casper"},
        {"name": "contract_icon_uri", "type": {"Option": "String"}, "value": "https://tiles.bot/icon.png"},
        {"name": "contract_project_uri", "type": {"Option": "String"}, "value": "https://tiles.bot"}
    ]' \
    2>&1

echo ""
echo "Deploy transaction submitted!"
echo "Wait ~30s for block inclusion, then verify with:"
echo "  casper-client query-global-state --node-address $RPC_URL --key $USER1_PUBKEY"
