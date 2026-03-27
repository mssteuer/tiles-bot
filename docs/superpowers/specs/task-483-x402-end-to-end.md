# Task #483 — x402 Agentic Claim Flow — Full End-to-End

## Goal
An AI agent (or any HTTP client) should be able to claim a tile fully autonomously via x402 payment — no wallet/browser needed. The server must verify the payment AND call the smart contract to actually mint the NFT.

## Current State
The claim route likely does DB update only. Need to also call the Base mainnet contract `claim(tokenId)` function server-side after x402 payment is verified.

## Flow
```
1. Agent: POST /api/tiles/42/claim
   Server: returns 402 with payment requirements (USDC amount, Base chain, pay-to address)

2. Agent: POST /api/tiles/42/claim + x-payment header (signed USDC payment)
   Server: 
     a. Verify payment via x402 middleware ✅ (already done)
     b. NEW: call contract.claim(42) using server wallet → get tx hash
     c. Store claim in DB with tx_hash ✅
     d. Return 200 with { ok: true, tileId: 42, txHash: "0x..." }
```

## Implementation

### Environment Variables needed in .env.local
```
SERVER_WALLET_PRIVATE_KEY=<private key for server wallet that calls contract>
NEXT_PUBLIC_CONTRACT_ADDRESS=0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E
NEXT_PUBLIC_CHAIN_ID=8453
```
The server wallet just needs to call `claim()` on behalf of the tile claimer. The wallet needs enough ETH for gas (~0.0001 ETH per claim on Base).

### src/app/api/tiles/[id]/claim/route.js
After x402 verification succeeds, add contract call:
```js
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CLAIM_ABI = parseAbi(['function claim(uint256 tokenId) external']);
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: base, transport: http() });

const txHash = await walletClient.writeContract({
  address: CONTRACT,
  abi: CLAIM_ABI,
  functionName: 'claim',
  args: [BigInt(tileId)],
});
```
Store `txHash` in DB. If contract call fails (tile already claimed on-chain), return 409.

### x402 Payment Amount
The USDC payment amount in the 402 response must match `getCurrentPrice()` from db.js. The x402 middleware `payTo` address is `process.env.X402_PAY_TO_ADDRESS`.

### Contract ABI Check
The contract's `claim()` function — verify it doesn't require the caller to be the tile owner (it shouldn't, anyone can claim for anyone). Check `artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json` for the actual function signature.

## Acceptance Criteria
- [ ] `POST /api/tiles/999/claim` (no payment) returns 402 with USDC amount and facilitator address
- [ ] With valid x402 payment header: server calls contract, returns 200 with txHash
- [ ] txHash stored in DB and visible in tile panel
- [ ] Double-claim attempt (tile already claimed): returns 409
- [ ] Gas estimation: document minimum ETH balance needed in server wallet
- [ ] `npm run build` passes
- [ ] Integration test (if possible): use a test account to claim a tile end-to-end

## Notes
- The server wallet private key must be kept secret — only in `.env.local`, never committed
- Add to `.gitignore` check that `.env.local` is excluded
- On mainnet: each `claim()` costs ~$0.01-0.05 in gas on Base
