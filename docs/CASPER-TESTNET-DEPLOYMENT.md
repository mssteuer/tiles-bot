# Casper Testnet Deployment Guide

## Status: READY — Awaiting Wallet Funding

Everything is built, tested, and scripted. The only blocker is testnet CSPR.

## Testnet Wallet

- **Public Key:** `0196f363185dc4b746109bddcf27632c506fec460cf4a0363801e1e3729ac6fb7f`
- **Key Path:** `~/.casper/testnet-deploy-key/`
- **Algorithm:** secp256k1
- **Current Balance:** 0 CSPR (unfunded)

## Funding

The Casper testnet faucet requires a browser with Casper Wallet extension — no programmatic API exists.

1. Go to https://testnet.cspr.live/tools/faucet
2. Connect Casper Wallet with the key above (or import secret_key.pem)
3. Request 5,000 CSPR (faucet default)
4. Wait for the transaction to finalize (~2 min)

**Minimum needed:** ~500 CSPR (wCSPR deploy ~150 + NFT deploy ~250 + mint tests ~50 + buffer)

## One-Command Deploy

Once the wallet is funded:

```bash
cd ~/workspace/million-bot-homepage/contracts/casper
./scripts/deploy.sh testnet
```

This runs:
1. Pre-flight checks (key, WASM, tests, balance)
2. Deploys mock wCSPR token (for testnet — no real wCSPR exists on testnet)
3. Deploys TilesBotNft contract (with bonding curve, batch claims, etc.)
4. Verifies contract state (name, symbol, owner, not paused)
5. Prints contract addresses

## Post-Deploy Steps

1. **Save contract addresses** from deploy output:
   - wCSPR: `hash-...`
   - TilesBotNft: `hash-...`

2. **Verify on explorer:**
   ```bash
   ./scripts/verify-deployment.sh <nft-contract-hash>
   ```
   Or visit: `https://testnet.cspr.live/contract/<hash>`

3. **Test minting on-chain:**
   ```bash
   cargo test --test deploy_livenet deploy_and_test_mint -- --nocapture
   ```
   (With ODRA_CASPER_LIVENET_* env vars still set from deploy.sh)

4. **Update tiles.bot config** (`.env.local`):
   ```
   CHAIN_CASPER_NFT_CONTRACT=hash-<deployed-nft-hash>
   CHAIN_CASPER_PAYMENT_TOKEN=hash-<deployed-wcspr-hash>
   CHAIN_CASPER_TREASURY=<public-key-hex>
   CHAIN_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
   CHAIN_CASPER_EXPLORER=https://testnet.cspr.live
   ```

## x402 Facilitator

The Casper x402 facilitator is at `https://x402-facilitator.cspr.cloud`.

- Requires an API key (`CASPER_FACILITATOR_API_KEY`)
- The facilitator handles 402 payment challenges for wCSPR
- After testnet deploy, need to register our contract with the facilitator
- API key must be obtained from cspr.cloud (contact Casper team)

## What's Been Validated

- 32 unit tests pass (bonding curve, single claim, batch claim, admin, metadata, transfers)
- WASM builds clean (TilesBotNft.wasm: 396KB, MockWcspr.wasm: 321KB)
- Deploy + mint tests pass in mock mode
- Deploy script has pre-flight checks for all dependencies
- Previous devnet testing attempted (devnet is unstable for longer flows — testnet recommended)

## Contract Capabilities

| Feature | Status |
|---|---|
| CEP-95 NFT (mint, transfer, approve) | Tested |
| CEP-96 collection metadata | Tested |
| Exponential bonding curve (0.01 → 111 CSPR) | Tested |
| wCSPR payment (transfer_from) | Tested |
| Batch claim (up to 100 tiles) | Tested |
| Pause/Unpause | Tested |
| Treasury withdrawal | Tested |
| Ownership transfer | Tested |
| Reentrancy protection | Implemented |
