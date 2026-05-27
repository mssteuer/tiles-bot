# TilesBot NFT Testnet Deployment Guide

## Current Status: BLOCKED on 3 Prerequisites

The contract is fully implemented and all 17 unit tests pass. WASM artifact built (396 KB).
Deployment scripts are ready. Three blockers remain:

### Blocker 1: Testnet Wallet Not Funded
- **Public key:** `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`
- **Key files:** `~/.casper/testnet-deploy-key/` (secret_key.pem, public_key.pem, public_key_hex)
- **Faucet:** https://testnet.cspr.live/tools/faucet (requires Casper Wallet browser sign-in)
- **Resolution:** Michael or a team member needs to visit the faucet URL with Casper Wallet installed and fund this key with 5,000 CSPR

### Blocker 2: wCSPR Testnet Contract Hash
- Need to find or deploy a CEP-18 wCSPR token on casper-test
- Check with the MAKE team if testnet wCSPR exists
- Alternative: deploy a test CEP-18 token ourselves (Odra has Cep18 module)

### Blocker 3: x402 Facilitator API Key for Testnet
- Need API key from cspr.cloud console for testnet environment
- Endpoint: https://x402-facilitator.cspr.cloud (testnet)
- Contact MAKE team / cspr.cloud for testnet credentials

## What's Been Verified

### Unit Tests (17/17 passing)
- Bonding curve: 6 tests (pricing at 0, max, midpoint, monotonicity, batch, overflow)
- Single claim: 6 tests (success, price increment, duplicate, invalid ID, paused, insufficient)
- Batch claim: present (in test_batch_claim.rs) -- 100-tile batch, empty, exceed max, duplicates  
- Metadata: 5 tests (CEP-95/96 metadata, set_tile_uri owner check, NFT transfer)
- Admin: present (in test_admin.rs) -- pause/unpause, withdraw, ownership transfer

### WASM Build
- `cargo odra build` produces `wasm/TilesBotNft.wasm` (396,260 bytes)
- Toolchain: nightly Rust, wasm-opt, wasm-strip (wabt)
- WASM exports: `call` (dispatcher) and `init` (installer)

### Local Devnet Testing (casper-devnet)
- casper-devnet v2.2.0 installed and working with 4-node network
- Network boots in ~2 minutes, reaches Validate state
- **Deployment via casper-client fails with error 64658** 
- Root cause: Odra contracts use a generated dispatcher that wraps args differently
  than raw casper-client `--session-args-json`. The init() args need to be passed
  through Odra's own deployment mechanism (cargo odra test --backend casper).

## Deployment Wallet

| Field | Value |
|-------|-------|
| Public key | `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f` |
| Key files | `~/.casper/testnet-deploy-key/` |
| Network | casper-test (Casper Testnet) |
| Faucet | https://testnet.cspr.live/tools/faucet |

## Deployment Methods

### Method A: Odra Livenet (Recommended)

The recommended way to deploy Odra contracts. Uses Odra's built-in deployment framework
which handles arg serialization correctly.

```bash
cd contracts/casper

export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=~/.casper/testnet-deploy-key/secret_key.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network/rpc
export ODRA_CASPER_LIVENET_EVENTS_URL=https://events.testnet.casper.network/events/main
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test

# Deploy via Odra's test runner (runs init on-chain)
cargo odra test --backend casper
```

### Method B: casper-client Direct Deploy

For manual deployment. **Note:** Odra contracts need special arg serialization.
The deploy-testnet.sh script handles this but may need adjustments for Odra's dispatcher.

```bash
cd contracts/casper
export WCSPR_CONTRACT=hash-<testnet-wcspr-hash>
export TREASURY_PUBKEY=0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f
./scripts/deploy-testnet.sh
```

### Method C: Local Devnet Testing

For validating the deployment flow without testnet CSPR:

```bash
# Start a 4-node devnet
casper-devnet start --network-name tiles-test --node-count 4 --users 3

# Wait ~2 min for blocks, then deploy
./scripts/deploy-devnet.sh
```

## Post-Deployment Verification

```bash
# Verify on-chain
./scripts/verify-deployment.sh <contract-hash>

# Test minting
./scripts/test-mint.sh <contract-hash> <wcspr-hash>

# Check on explorer
# https://testnet.cspr.live/contract/<contract-hash>
```

## Contract Init Parameters

| Parameter | Value |
|-----------|-------|
| name | TilesBot |
| symbol | TILE |
| wcspr_address | <testnet wCSPR contract hash> |
| treasury | Deploy wallet account hash |
| contract_name | TilesBot Grid |
| contract_description | AI Agent Grid on Casper |
| contract_icon_uri | https://tiles.bot/icon.png |
| contract_project_uri | https://tiles.bot |

## Gas Estimates

| Operation | Estimated Gas (motes) |
|-----------|-----------------------|
| Contract install | 250,000,000,000 (250 CSPR) |
| claim (single) | 5,000,000,000 (5 CSPR) |
| batch_claim (100) | ~50,000,000,000 (50 CSPR) |
| approve (wCSPR) | 3,000,000,000 (3 CSPR) |

## x402 Integration

After contract deployment:
1. Configure facilitator API key in `.env.local`
2. Set `CHAIN_CASPER_NFT_CONTRACT` to the deployed contract hash
3. Set `CHAIN_CASPER_PAYMENT_TOKEN` to wCSPR contract hash
4. Test the 402->pay->settle flow via `/api/tiles/:id/claim`

## Network Details

| Field | Value |
|-------|-------|
| Chain | casper-test |
| RPC | https://node.testnet.casper.network/rpc |
| SSE | https://events.testnet.casper.network/events/main |
| Explorer | https://testnet.cspr.live |
| Faucet | https://testnet.cspr.live/tools/faucet |

## Deployment Lessons Learned

1. **casper-devnet single-node doesn't work** -- needs 4+ nodes for consensus
2. **casper-devnet with chainspec overrides** -- use `core.minimum_block_time="4sec"` (TOML string format), NOT `highway.minimum_round_exponent` (removed in 2.x)
3. **Odra WASM arg format** -- Odra generates its own dispatcher; raw casper-client `--session-args-json` does NOT work for init args. Use Odra's livenet framework or write a custom deployment script that matches the dispatcher's expected format.
4. **casper-client 5.x** -- requires `--standard-payment true` flag (new in Casper 2.x)
