# TilesBot NFT Testnet Deployment Guide

## Status: BLOCKED on Faucet Funding

The contract is built and all unit tests pass. Deployment scripts are ready.
Two blockers prevent proceeding:

1. **Testnet wallet not funded** - The faucet at https://testnet.cspr.live/tools/faucet requires Casper Wallet browser sign-in (cannot be done headlessly)
2. **wCSPR testnet contract hash unknown** - Need to find or deploy a CEP-18 wCSPR token on testnet
3. **x402 facilitator API key** - Need to obtain from cspr.cloud console for testnet

## Deployment Wallet

- **Public key:** `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`
- **Key files:** `~/.casper/testnet-deploy-key/` (secret_key.pem, public_key.pem, public_key_hex)
- **Network:** casper-test (Casper Testnet)
- **Faucet:** https://testnet.cspr.live/tools/faucet (gives 5,000 CSPR, one-time)

## Prerequisites

1. Fund the deployment wallet via the testnet faucet (5,000 CSPR)
2. Find/deploy a wCSPR (CEP-18) token on testnet
3. Obtain x402 facilitator API key for testnet

## Deployment Steps

### Option A: casper-client Direct Deploy

```bash
cd contracts/casper

# Set environment
export WCSPR_CONTRACT=hash-<testnet-wcspr-hash>
export TREASURY_PUBKEY=0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f

# Deploy
./scripts/deploy-testnet.sh
```

### Option B: Odra Livenet Environment

```bash
cd contracts/casper

# Set environment
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=~/.casper/testnet-deploy-key/secret_key.pem
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network/rpc
export ODRA_CASPER_LIVENET_EVENTS_URL=https://events.testnet.casper.network/events/main
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test

# Deploy via Odra's test runner
./scripts/deploy-odra-livenet.sh
```

### Post-Deployment Verification

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
|-----------|----------------------|
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

- **Chain:** casper-test
- **RPC:** https://node.testnet.casper.network/rpc
- **SSE:** https://events.testnet.casper.network/events/main
- **Explorer:** https://testnet.cspr.live
- **Faucet:** https://testnet.cspr.live/tools/faucet
