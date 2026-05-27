# Casper Testnet Deployment Guide

**Contract:** TilesBot NFT (CEP-95/96)
**Chain:** Casper Testnet (`casper-test`)
**Deployer Key:** `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`

## Status

- [x] Contract code: complete, all 32 tests passing
- [x] WASM artifacts: built and optimized (TilesBotNft.wasm 396KB, MockWcspr.wasm 322KB)
- [x] Deployment scripts: ready (deploy.sh testnet/devnet, deploy-devnet.sh, verify-deployment.sh, test-mint.sh)
- [x] Mock deployment: verified via Odra VM (deploy_livenet.rs)
- [x] Odra livenet env: configured (.env.testnet)
- [x] CSPR.cloud API key: available (from cspr-guru project)
- [x] **Devnet deployment: VERIFIED** -- full deploy + approve + claim + batch_claim on casper-devnet (2026-05-27)
- [ ] **BLOCKER: Testnet wallet unfunded** -- requires browser + Casper Wallet extension

## Prerequisites

### 1. Fund the Testnet Wallet (MANUAL -- requires browser)

The deployer account needs at least 1,500 CSPR on Casper Testnet.

**Faucet:** https://testnet.cspr.live/tools/faucet
- Requires: Casper Wallet browser extension (https://www.casperwallet.io/)
- Import key from `~/.casper/testnet-deploy-key/secret_key.pem`
- Or add the public key: `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`
- The faucet provides 5,000 CSPR per account

**There is NO programmatic faucet API.** All tested endpoints return HTML or require browser auth.

**Verify funding:**
```bash
casper-client query-balance \
  --node-address https://node.testnet.casper.network/rpc \
  --purse-identifier "0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f"
```

### 2. Build WASM Artifacts (already done)

```bash
cd contracts/casper
cargo test         # 32 tests, all passing
cargo odra build   # Produces wasm/TilesBotNft.wasm + wasm/MockWcspr.wasm
```

### 3. x402 Facilitator API Key

CSPR.cloud API key available: `019a1227-9380-70e9-b22e-39c17bcf43d2` (from cspr-guru project).
Stored in `.env.testnet` for use by deploy scripts.

## Deploy (One Command)

### Testnet

Once the wallet is funded:

```bash
cd contracts/casper
./scripts/deploy.sh testnet
```

### Devnet (Local Integration Testing)

No funding needed -- devnet accounts have 1B CSPR each:

```bash
cd contracts/casper
./scripts/deploy-devnet.sh          # starts devnet, deploys, tests
./scripts/deploy-devnet.sh --no-start  # if devnet already running
```

Alternatively via deploy.sh:
```bash
cd contracts/casper
./scripts/deploy.sh devnet
```

**Critical devnet notes:**
- Uses 4 nodes (single node gets stuck on peer discovery)
- Chain name auto-detected from `--network-name` flag (becomes `chainspec_name`)
- SSE path is `/events` (NOT `/events/main` like testnet)
- Odra contracts MUST be deployed via Odra framework, NOT raw casper-client (error 64658)
- secp256k1 keys (02-prefix) work fine -- derived via `casper-devnet derive`

### Testnet deploy.sh details

```bash
cd contracts/casper
./scripts/deploy.sh testnet
```

This script:
1. Loads `.env.testnet` configuration
2. Verifies secret key exists
3. Builds WASM if needed
4. Runs all 32 unit tests
5. Checks account balance (requires >= 500 CSPR)
6. Deploys MockWcspr (test wCSPR token) + TilesBotNft via Odra livenet
7. Runs mint test to verify end-to-end functionality

### What Gets Deployed

1. **MockWcspr** (test CEP-18 token) -- acts as wCSPR for testnet
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

Add to `.env.local` in the project root:
```
CHAIN_CASPER_NFT_CONTRACT=hash-<nft-contract-hash>
CHAIN_CASPER_PAYMENT_TOKEN=hash-<wcspr-contract-hash>
CHAIN_CASPER_TREASURY=0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
CHAIN_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CHAIN_CASPER_EXPLORER=https://testnet.cspr.live
CHAIN_CASPER_X402_FACILITATOR=https://x402-facilitator.cspr.cloud
CASPER_FACILITATOR_API_KEY=019a1227-9380-70e9-b22e-39c17bcf43d2
```

## x402 Integration

### Facilitator Setup

The Casper x402 facilitator lives at `x402-facilitator.cspr.cloud`.
- Requires CSPR.cloud API key in `Authorization` header (NOT `Bearer` or `X-API-Key`)
- Settlements to the `payTo` address (treasury)
- The `/verify` endpoint accepts POST with x402 payment headers
- Facilitator returns `"authorization is not provided"` without the API key

**Auth format:** `Authorization: <api-key>` (raw key, no Bearer prefix)

### Test x402 Flow

1. Get current price: query `current_price()` on NFT contract
2. Create x402 payment for that amount
3. Submit to facilitator for verification
4. Facilitator settles wCSPR to contract
5. Verify settlement via balance check

### x402 Testnet Status

- Facilitator endpoint: `https://x402-facilitator.cspr.cloud` (mainnet + testnet share endpoint)
- No separate testnet facilitator URL confirmed (testnet.cspr.cloud returns 000)
- API key `019a1227-9380-70e9-b22e-39c17bcf43d2` is for CSPR.cloud (cspr-guru project)
- Full x402 end-to-end flow requires: deployed NFT contract + funded wCSPR token + facilitator auth
- Blocked on testnet deployment (wallet funding) for live x402 testing

## Key Files

| File | Purpose |
|------|---------|
| `contracts/casper/src/tiles_bot_nft.rs` | Main NFT contract |
| `contracts/casper/src/bonding_curve.rs` | Pricing logic |
| `contracts/casper/src/mock_wcspr.rs` | Test wCSPR token |
| `contracts/casper/tests/deploy_livenet.rs` | Deployment test (mock + livenet) |
| `contracts/casper/scripts/deploy.sh` | One-command deploy (testnet or devnet) |
| `contracts/casper/scripts/deploy-devnet.sh` | Full devnet lifecycle (start, deploy, test) |
| `contracts/casper/scripts/verify-deployment.sh` | Post-deploy verification |
| `contracts/casper/scripts/test-mint.sh` | Manual mint test flow |
| `contracts/casper/.env.testnet` | Odra livenet env config |
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
