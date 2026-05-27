# TilesBot NFT -- Casper Testnet Deployment Guide

## Status: DEVNET VERIFIED — Testnet pending wallet funding

Contract: fully implemented, 32 tests pass, WASM built (396 KB).
Devnet: FULL DEPLOYMENT VERIFIED — deploy, mint, batch mint, ownership all tested on local devnet.
Deployment scripts: ready. Odra livenet integration: verified (auto-detects via env var).
Odra deps upgraded to 2.7.0 with `odra-casper-livenet-env` for real chain deployment.
Testnet: blocked on wallet funding (faucet requires browser + Casper Wallet extension).

## Prerequisites Checklist

- [x] Contract source code and unit tests (32/32 passing)
- [x] WASM artifacts built (`cargo odra build` -> `wasm/TilesBotNft.wasm` 396 KB, `wasm/MockWcspr.wasm` 321 KB)
- [x] Deployment key generated (`~/.casper/testnet-deploy-key/`)
- [x] Deployment scripts created (`scripts/deploy.sh`, testnet + devnet)
- [x] Livenet deployment test with auto-detection (`tests/deploy_livenet.rs`)
- [x] Odra 2.7.0 with livenet backend dep (`odra-casper-livenet-env`)
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
5. Deploys test wCSPR + TilesBot NFT via Odra livenet backend
6. Verifies contract state on-chain
7. Prints contract addresses for .env.local configuration

### Option B: Manual Odra Deploy

```bash
cd contracts/casper

export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=~/.casper/testnet-deploy-key/secret_key.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
export ODRA_CASPER_LIVENET_EVENTS_URL=https://events.testnet.casper.network/events/main
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test

# Deploy and verify
cargo test --test deploy_livenet deploy_and_verify -- --nocapture

# Deploy and test minting
cargo test --test deploy_livenet deploy_and_test_mint -- --nocapture
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
| wCSPR deploy | ~500,000,000,000 | ~500 |
| NFT deploy | ~800,000,000,000 | ~800 |
| claim (single) | ~50,000,000,000 | ~50 |
| batch_claim (3) | ~100,000,000,000 | ~100 |
| approve (wCSPR) | ~50,000,000,000 | ~50 |

**Total for deploy+test: ~1,500 CSPR** (well within 5,000 CSPR faucet)

## Deployment Key

| Field | Value |
|-------|-------|
| Public key | `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f` |
| Key files | `~/.casper/testnet-deploy-key/` |
| Network | casper-test |

## Livenet Backend: How It Works

The `tests/deploy_livenet.rs` auto-detects the backend:
- If `ODRA_CASPER_LIVENET_SECRET_KEY_PATH` is set -> uses `odra_casper_livenet_env::env()` (real chain)
- If unset -> uses `odra_test::env()` (mock VM, for CI and development)

This means:
- `cargo test` -> mock (fast, no CSPR needed)
- `./scripts/deploy.sh testnet` -> real testnet (exports env vars, then calls cargo test)

## Known Issues

1. **casper-client raw deploy doesn't work for Odra contracts** -- Odra uses a custom
   arg dispatcher. Always use the deploy test or deploy.sh for deployment.
2. **casper-devnet single-node stuck** -- use 4+ nodes for consensus.
3. **Testnet faucet is browser-only** -- cannot be automated from CLI.
4. **cargo odra test --nocapture bug** -- cargo odra reorders args incorrectly, so
   deploy.sh uses `cargo test` directly with env vars set.
5. **Rust toolchain: nightly-2025-01-01** -- newer nightlies break WASM linking.
   The `idna_adapter` dep is pinned to 1.2.0 to avoid icu crates requiring rustc 1.86+.
6. **NODE_ADDRESS must NOT end with /rpc** -- Odra's casper_client appends /rpc
   internally. Using `https://node.testnet.casper.network/rpc` causes double-path
   `/rpc/rpc`. Correct: `https://node.testnet.casper.network` (no suffix).
7. **EVENTS_URL for devnet is /events, not /events/main** -- casper-devnet SSE
   endpoint is at `http://127.0.0.1:18101/events`. Using `/events/main` returns
   "invalid path". Testnet uses `/events/main`.
8. **Gas must be set before deploy** -- `env.set_gas(N)` MUST be called before
   each `deploy()`, `approve()`, or `claim()` call. Odra initializes gas to zero;
   without set_gas the transaction fails with "Out of gas error" on the network.
9. **casper-devnet keys use secp256k1** -- derived keys (BIP32 path m/44'/506'/...)
   produce `02`-prefix secp256k1 keys. This works fine with Odra livenet.
10. **casper-devnet derive outputs \\r\\n line endings** -- pipe through `tr -d '\\r'`
    before saving PEM files, or Odra's PEM parser may fail.
