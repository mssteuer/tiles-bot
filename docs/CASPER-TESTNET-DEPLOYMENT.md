# Casper Testnet Deployment Guide

**Contract:** TilesBot NFT (CEP-95/96)
**Chain:** Casper Testnet (`casper-test`)
**Deployer Key:** `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`

## Prerequisites

### 1. Fund the Testnet Wallet

The deployer account needs at least 1,500 CSPR on Casper Testnet.

**Faucet:** https://testnet.cspr.live/tools/faucet
- Requires: Casper Wallet browser extension (https://www.casperwallet.io/)
- Import key from `~/.casper/testnet-deploy-key/secret_key.pem`
- Or add the public key: `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`
- The faucet provides 5,000 CSPR per account

**Verify funding:**
```bash
casper-client query-balance \
  --node-address https://node.testnet.casper.network/rpc \
  --purse-identifier "0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f"
```

### 2. Build WASM Artifacts

```bash
cd contracts/casper
cargo test         # 32 tests, all passing
cargo odra build   # Produces wasm/TilesBotNft.wasm + wasm/MockWcspr.wasm
```

### 3. x402 Facilitator API Key

Get a CSPR.cloud API key from https://console.cspr.cloud for the testnet x402 facilitator.

## Deploy

### One-Command Deploy

```bash
cd contracts/casper
./scripts/deploy.sh testnet
```

This script:
1. Verifies secret key exists
2. Builds WASM if needed
3. Runs all unit tests
4. Checks account balance (requires >= 500 CSPR)
5. Deploys MockWcspr (test wCSPR) + TilesBotNft via Odra livenet

### What Gets Deployed

1. **MockWcspr** (test CEP-18 token) - acts as wCSPR for testnet
   - Gas: 500 CSPR
   - Initial supply: 1,000,000 CSPR (1M)
2. **TilesBotNft** (CEP-95/96 NFT)
   - Gas: 800 CSPR
   - Name: "TilesBot", Symbol: "TILE"
   - Treasury: deployer account
   - Metadata: icon/project URIs pointing to tiles.bot

### After Deploy

1. Note the contract addresses from deployment output
2. Verify on explorer: `https://testnet.cspr.live/contract/<hash>`
3. Run verification: `./scripts/verify-deployment.sh <nft-contract-hash>`

### Update Configuration

Add to `.env.local`:
```
CHAIN_CASPER_NFT_CONTRACT=hash-<nft-contract-hash>
CHAIN_CASPER_PAYMENT_TOKEN=hash-<wcspr-contract-hash>
CHAIN_CASPER_TREASURY=0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
CHAIN_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CHAIN_CASPER_EXPLORER=https://testnet.cspr.live
CHAIN_CASPER_X402_FACILITATOR=https://x402-facilitator.testnet.cspr.cloud
CASPER_FACILITATOR_API_KEY=<your-cspr-cloud-api-key>
```

## x402 Integration

### Facilitator Setup

The Casper x402 facilitator lives at `x402-facilitator.cspr.cloud`. For testnet:
- Endpoint: `https://x402-facilitator.testnet.cspr.cloud` (pending verification)
- Requires CSPR.cloud API key in `Authorization` header
- Settlements to the `payTo` address (treasury)

### Test x402 Flow

1. Get current price: query `current_price()` on NFT contract
2. Create x402 payment for that amount
3. Submit to facilitator for verification
4. Facilitator settles wCSPR to contract
5. Verify settlement via balance check

## Key Files

| File | Purpose |
|------|---------|
| `contracts/casper/src/tiles_bot_nft.rs` | Main NFT contract |
| `contracts/casper/src/bonding_curve.rs` | Pricing logic |
| `contracts/casper/src/mock_wcspr.rs` | Test wCSPR token |
| `contracts/casper/tests/deploy_livenet.rs` | Deployment test (mock + livenet) |
| `contracts/casper/scripts/deploy.sh` | One-command deploy script |
| `contracts/casper/scripts/verify-deployment.sh` | Post-deploy verification |
| `contracts/casper/scripts/test-mint.sh` | Manual mint test flow |
| `contracts/casper/wasm/TilesBotNft.wasm` | Compiled NFT contract (396KB) |
| `contracts/casper/wasm/MockWcspr.wasm` | Compiled wCSPR token (322KB) |

## Testnet Endpoints

| Service | URL |
|---------|-----|
| RPC | https://node.testnet.casper.network/rpc |
| SSE Events | https://events.testnet.casper.network/events/main |
| Explorer | https://testnet.cspr.live |
| Faucet | https://testnet.cspr.live/tools/faucet |
| x402 Facilitator | https://x402-facilitator.cspr.cloud |
