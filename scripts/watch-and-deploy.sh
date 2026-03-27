#!/bin/bash
# Poll Base mainnet for ETH arrival, then auto-deploy the updated contract
WALLET="0x67439832C52C92B5ba8DE28a202E72D09CCEB42f"
PROJECT="/home/jeanclaude/workspace/million-bot-homepage"

while true; do
  BAL=$(curl -s -X POST https://mainnet.base.org -H "Content-Type: application/json" -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"eth_getBalance\",
    \"params\": [\"$WALLET\", \"latest\"],
    \"id\": 1
  }" | python3 -c "import json,sys; d=json.load(sys.stdin); print(int(d.get('result','0x0'),16))")

  if [ "$BAL" -gt 0 ]; then
    echo "$(date): ETH arrived! Balance: $(python3 -c "print(f'{$BAL/1e18:.6f}')" ) ETH"
    echo "Deploying contract..."
    cd "$PROJECT"
    npx hardhat run scripts/deploy.js --network base 2>&1
    EXIT=$?
    if [ $EXIT -eq 0 ]; then
      echo "$(date): Deploy SUCCESS"
    else
      echo "$(date): Deploy FAILED (exit $EXIT)"
    fi
    exit $EXIT
  fi
  sleep 15
done
