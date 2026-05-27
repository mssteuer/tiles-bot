# TilesBot NFT -- Casper Testnet Deployment Guide

## Status: READY TO DEPLOY (pending wallet funding)

Contract: fully implemented, 17/17 unit tests pass, WASM built (396 KB).
Deployment scripts: ready. Odra livenet deployment tests: verified on mock backend.

## Prerequisites Checklist

- [x] Contract source code and unit tests (17/17 passing)
- [x] WASM artifact built (`cargo odra build` -> `wasm/TilesBotNft.wasm`, 396 KB)
- [x] Deployment key generated (`~/.casper/testnet-deploy-key/`)
- [x] Deployment scripts created (`scripts/deploy.sh`, testnet + devnet)
- [x] Livenet deployment test verified on mock backend
- [ ] **Wallet funded with 5,000 CSPR** (needs browser faucet)
- [ ] **x402 facilitator API key** (needs cspr.cloud console)

## How to Fund the Wallet

The Casper testnet faucet requires the Casper Wallet browser extension.

1. Install [Casper Wallet](https://www.casperwallet.io/) browser extension
2. Import or create a wallet (you can import the testnet key if needed)
3. Visit: https://testnet.cspr.live/tools/faucet
4. Sign in with Casper Wallet
5. Request 5,000 CSPR for:
   ```
   0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
   ```
6. Verify funding:
   ```bash
   casper-client query-balance \
     --node-address https://node.testnet.casper.network/rpc \
     --purse-identifier 0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
   ```

## Deploy (Once Wallet Is Funded)

### Option A: One-Command Deploy (recommended)

```bash
cd contracts/casper
./scripts/deploy.sh testnet
```

This script:
1. Checks secret key exists
2. Verifies WASM is built
3. Runs unit tests
4. Checks account balance (testnet only)
5. Deploys a test wCSPR + TilesBot NFT via Odra livenet
6. Verifies contract state on-chain

### Option B: Manual Odra Deploy

```bash
cd contracts/casper

export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=~/.casper/testnet-deploy-key/secret_key.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network/rpc
export ODRA_CASPER_LIVENET_EVENTS_URL=https://events.testnet.casper.network/events/main
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test

# Deploy and verify
cargo odra test --backend casper -t deploy_and_verify -- --nocapture

# Deploy and test minting
cargo odra test --backend casper -t deploy_and_test_mint -- --nocapture
```

### Option C: Local Devnet (no CSPR needed)

```bash
# Start a 4-node devnet
casper-devnet start --network-name tiles-deploy --node-count 4 --users 3

# Deploy to devnet
./scripts/deploy.sh devnet
```

## Post-Deployment Steps

After successful deployment, you'll get contract hashes from the output.

1. **Record contract addresses:**
   - wCSPR contract hash (or use existing testnet wCSPR)
   - TilesBot NFT contract hash

2. **Update project .env.local:**
   ```
   CHAIN_CASPER_NFT_CONTRACT=hash-<nft-contract-hash>
   CHAIN_CASPER_PAYMENT_TOKEN=hash-<wcspr-contract-hash>
   CHAIN_CASPER_TREASURY=0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
   CHAIN_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
   CHAIN_CASPER_EXPLORER=https://testnet.cspr.live
   ```

3. **Verify on explorer:**
   ```bash
   ./scripts/verify-deployment.sh <nft-contract-hash>
   # Also: https://testnet.cspr.live/contract/<contract-hash>
   ```

4. **Test x402 flow** (once API key is obtained):
   - Configure `CASPER_FACILITATOR_API_KEY` in `.env.local`
   - Test: `curl -X POST https://tiles.bot/api/tiles/42/claim` (should return 402)

## Contract Init Parameters

| Parameter | Value |
|-----------|-------|
| name | TilesBot |
| symbol | TILE |
| wcspr_address | (deployed wCSPR hash) |
| treasury | Deploy wallet address |
| contract_name | TilesBot Grid |
| contract_description | AI Agent Grid on Casper |
| contract_icon_uri | https://tiles.bot/icon.png |
| contract_project_uri | https://tiles.bot |

## Gas Estimates

| Operation | Gas (motes) | CSPR |
|-----------|-------------|------|
| wCSPR deploy | ~150,000,000,000 | ~150 |
| NFT deploy | ~250,000,000,000 | ~250 |
| claim (single) | ~5,000,000,000 | ~5 |
| batch_claim (100) | ~50,000,000,000 | ~50 |
| approve (wCSPR) | ~3,000,000,000 | ~3 |

**Total for deploy+test: ~500 CSPR** (well within 5,000 CSPR faucet)

## Deployment Key

| Field | Value |
|-------|-------|
| Public key | `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f` |
| Key files | `~/.casper/testnet-deploy-key/` |
| Network | casper-test |

## Known Issues

1. **casper-client raw deploy doesn't work for Odra contracts** -- Odra uses a custom
   arg dispatcher. Always use `cargo odra test --backend casper` for deployment.
2. **casper-devnet single-node stuck** -- use 4+ nodes for consensus.
3. **Testnet faucet is browser-only** -- cannot be automated from CLI.
