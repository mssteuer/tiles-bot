# tiles.bot Multi-Chain Analysis: Base + Casper

**Date:** 2026-05-25
**Author:** Jean Clawd van Amsterdam 🥋
**Status:** Research & Planning

---

## Executive Summary

Making tiles.bot multi-chain means going from "NFT grid on Base" to "NFT grid that lives on Base AND Casper simultaneously." This touches every layer: smart contracts, wallet connections, payment flows, agent interfaces, database schema, and the entire agentic ecosystem (MCP, skills, llms.txt, x402).

**The good news:** The x402 protocol is designed for multi-chain, and Casper's implementation follows the same verify→settle pattern. The grid concept is chain-agnostic.

**The hard truth:** The current codebase has zero chain abstraction. Every file assumes Base. There's no TypeScript SDK for Casper x402. And the NFT standards are completely different (ERC-721 vs CEP-78).

---

## 1. Blockchain Layer

### 1.1 Smart Contracts

**Current (Base):**
- `MillionBotHomepage.sol` — ERC-721 with USDC payment, bonding curve, `claim()`/`batchClaim()`
- Deployed to Base mainnet (chain 8453) and Base Sepolia (84532)
- USDC as payment token (ERC-20)

**Needed (Casper):**
- CEP-78 NFT contract (Casper's enhanced NFT standard, successor to CEP-47)
  - CEP-78 supports metadata, burn modes, ownership modes — functionally equivalent to ERC-721
  - Must implement: `mint()`, `batch_mint()`, `owner_of()`, `total_supply()`
  - Bonding curve logic in contract or off-chain (design decision — see Questions)
- CEP-18 payment token for x402 (see §3)
  - Needs the **custom `Cep18X402.wasm`** that adds `transfer_with_authorization` entry point
  - Standard CEP-18 tokens do NOT support x402 — this is a custom extension

**Key differences:**

| Aspect | Base (ERC-721) | Casper (CEP-78) |
|--------|---------------|-----------------|
| Token IDs | uint256 (0–65535) | String or u64 |
| Ownership query | `ownerOf(tokenId)` → address | `owner_of(token_id)` → Key (account-hash or contract) |
| Batch ops | Custom `batchClaim()` | Can be built into contract |
| Payment | USDC (ERC-20) | CSPR native or CEP-18 token |
| Metadata | On-chain or tokenURI | CEP-78 built-in metadata schema |
| Contract language | Solidity | Rust (compiled to Wasm) |
| Deploy toolchain | Hardhat | cargo-casper / Odra framework |
| Explorer | BaseScan | cspr.live |
| Marketplace | OpenSea | ? (see §8) |

### 1.2 Payment Token

**❓ DECISION REQUIRED: What token do users pay with on Casper?**

Options:
1. **Native CSPR** — simplest UX, but x402 protocol currently only supports CEP-18 tokens (not native CSPR). Would need a wrapper or protocol extension.
2. **Wrapped CSPR (WCSPR)** — CEP-18 token, but needs the custom x402 extension (`transfer_with_authorization`). Existing WCSPR contract would need redeployment with x402 support.
3. **USDC on Casper** — if/when available. Best parity with Base.
4. **Custom x402-enabled CEP-18 token** — deploy a new token specifically for tiles.bot payments.

**Recommendation:** Use native CSPR for the UI path and a WCSPR-with-x402 token for the agent/x402 path. This gives humans the simplest UX while keeping x402 compatibility for agents. The price would need to be denominated in CSPR (not USD-pegged unless USDC launches on Casper).

### 1.3 Bonding Curve

Formula (same on both chains): `price = e^(ln(11111) × totalMinted / 65536) / 100`

**✅ DECIDED: Separate independent curves per chain.**

Each chain tracks its own `totalMinted` and computes its own price on-chain. No cross-chain oracle or server dependency for pricing. The contract is fully self-contained and trustless.

- If Base has 1,000 mints and Casper has 200, Casper tiles are cheaper → early movers on a new chain get rewarded
- Same formula, same range ($0.01 → $111.11), don't overthink the theoretical ceiling
- Neither chain will ever hit all 65,536 (shared namespace), which is fine

---

## 2. Frontend / User Experience

### 2.1 Wallet Connection

**Current:** ConnectKit + wagmi (EVM only). Single chain.

**Multi-chain approach:**

The fundamental UX question: do users connect ONE wallet or TWO?

- **Casper wallets** use different key formats (ed25519 / secp256k1) and addresses (account hashes, not 0x addresses)
- **No wagmi equivalent for Casper** — the Casper Wallet and Casper Signer are browser extensions with their own JS SDK (`casper-js-sdk`)
- ConnectKit/RainbowKit don't support non-EVM chains

**Proposed UX flow:**

```
┌─────────────────────────────────────┐
│          tiles.bot                   │
│                                     │
│   ┌──────────┐  ┌────────────────┐  │
│   │ Base 🔵  │  │ Casper 🔴      │  │
│   │ Connect  │  │ Connect Casper │  │
│   │ Wallet   │  │ Wallet         │  │
│   └──────────┘  └────────────────┘  │
│                                     │
│   Grid shows tiles from BOTH chains │
│   Tile border color = chain         │
│   🔵 = Base  🔴 = Casper           │
└─────────────────────────────────────┘
```

- Keep ConnectKit/wagmi for Base
- Add Casper Wallet SDK alongside (separate provider)
- Chain selector in the claim flow, NOT a global chain switch
- Grid renders tiles from both chains simultaneously (visually distinguished)
- A user can own tiles on both chains with different wallets

### 2.2 UI Components Needing Changes

| Component | Change |
|-----------|--------|
| `Header.js` | Add Casper wallet connect button |
| `Providers.js` | Add CasperWalletProvider alongside WagmiProvider |
| `ClaimModal.js` | Chain selection step, different flows per chain |
| `BatchClaimModal.js` | Chain-aware batch claiming |
| `AboutTab.js` | Explorer links per chain (basescan vs cspr.live) |
| `Grid.js` (if exists) | Visual chain indicator on each tile |
| New: `CasperWalletButton.js` | Casper wallet connection component |
| New: `ChainBadge.js` | Visual indicator for which chain a tile is on |

### 2.3 Wallet Signature Verification

**Current:** `verify-wallet-sig.js` uses ethers.js `verifyMessage` (EVM secp256k1)

**Casper:** Uses `casper-js-sdk` signature verification. Supports both ed25519 and secp256k1. Different message format, different sig format (algo byte prefix).

**Must create:** Chain-aware signature verification that routes to the correct crypto library based on address format.

---

## 3. x402 Payment Protocol

### 3.1 Current Implementation (Base)

- Uses `x402-next` npm package (wraps Next.js API routes)
- Flow: POST `/api/tiles/{id}/claim` → 402 → Agent pays USDC → Gets mint instructions
- Facilitator: Coinbase's public EVM facilitator (or self-hosted)
- Network: `base-sepolia` or `base` (CAIP-2: `eip155:8453`)

### 3.2 Casper x402 Implementation

**Protocol:** Same 402 → pay → verify → settle pattern, but:

| Aspect | Base x402 | Casper x402 |
|--------|----------|-------------|
| SDK language | TypeScript (`x402-next`, `@anthropic-ai/x402`) | **Go only** ⚠️ |
| Network ID | `eip155:8453` | `casper:casper` / `casper:casper-test` |
| Signature | EIP-712 (Ethereum keccak256) | EIP-712 adapted via `casper-eip-712` |
| Asset | ERC-20 address (0x...) | CEP-18 package hash (64-char hex) |
| Addresses | 0x + 20 bytes | 00 + 32 bytes (account hash) |
| Settlement | ERC-20 `transferWithAuthorization` (EIP-3009) | CEP-18 `transfer_with_authorization` (custom Wasm) |
| Facilitator | Coinbase hosted / self-hosted | Self-hosted or `x402-facilitator.cspr.cloud` |

### 3.3 The SDK Gap (Critical)

**🚨 There is NO TypeScript/JavaScript client SDK for Casper x402.**

The entire Casper x402 implementation is in Go. tiles.bot is a Next.js app (TypeScript/JavaScript). This is the single biggest technical gap.

**Options to bridge:**

1. **Port the Casper x402 client to TypeScript** — Medium effort. Need to implement EIP-712 typed-data signing using `casper-eip-712` logic in JS. The `casper-js-sdk` already has key/signing primitives, so the crypto layer exists.

2. **Go sidecar service** — Run the Go facilitator client as a microservice that the Next.js server calls. Adds operational complexity.

3. **Server-side only** — Since x402 is primarily for agent-to-server payments (not browser), the server just needs to VERIFY Casper payments (which means calling the Casper facilitator). The client-side payment is the agent's responsibility. The server could support Casper x402 by:
   - Returning `PaymentRequirements` with Casper network details in the 402 response
   - Calling `x402-facilitator.cspr.cloud/verify` and `/settle` to validate payment
   - This is just HTTP — no Go SDK needed on the server side

**Recommendation:** Option 3 for the server side (call the facilitator's HTTP API directly — it's just REST). For agent clients that want to pay, they'll need the Go client or a TS port. Since we control the tiles.bot MCP and skill, we can provide the payment flow there.

### 3.4 Facilitator Setup

**For testnet:** Use `https://x402-facilitator.cspr.cloud/` (already deployed, requires API key)
**For mainnet:** Either:
- Self-host the Go facilitator (Docker image available)
- Use the MAKE-hosted facilitator at cspr.cloud (if they offer mainnet)

**Facilitator needs:**
- Private key funded with CSPR (pays gas for settlements)
- Access to Casper RPC node
- The CEP-18 x402 token contract deployed

### 3.5 Multi-Chain x402 Server Flow

```
Agent: POST /api/tiles/{id}/claim
Server: Which chain?

If header says "casper:casper":
  → Return 402 with Casper PaymentRequirements
  → Agent signs with Casper key
  → Server calls cspr.cloud facilitator /verify + /settle
  → Returns Casper mint instructions

If header says "eip155:8453" (or default):
  → Return 402 with Base PaymentRequirements (existing flow)
  → Agent pays USDC via x402-next
  → Returns Base mint instructions
```

The 402 response already includes a `network` field — agents can express chain preference, and the server can offer multiple `PaymentRequirements` options.

---

## 4. Agentic Interfaces

### 4.1 MCP Server (`tiles-bot-mcp`)

**Current:** 26 tools wrapping REST endpoints. Chain-agnostic at the API level, but all on-chain operations assume Base.

**Changes needed:**
- Every tool that touches the chain needs a `chain` parameter: `claim`, `register`, `check-owner`, `batch-register`
- New tool: `get-supported-chains` — returns available chains with contract addresses
- New tool: `casper-claim` — Casper-specific claim flow (different from EVM)
- Update tool descriptions to mention multi-chain
- PaymentRequirements in 402 responses need chain-specific details

### 4.2 SKILL.md (`tiles.bot/SKILL.md`)

**Current:** All instructions assume Base, ethers.js, EVM wallet.

**Must add:**
- Casper wallet setup (PEM key, casper-client)
- Casper claim flow (different from EVM — uses `casper-client put-txn`)
- Casper x402 payment (Go client or manual curl)
- Chain selection in all API calls
- Casper explorer links (cspr.live)

### 4.3 llms.txt (`tiles.bot/llms.txt`)

**Current:** Describes tiles.bot for LLM agents. Probably chain-agnostic for most content but needs:

- Multi-chain support declaration
- Which chains are supported
- How to choose a chain
- Different wallet requirements per chain
- Payment token per chain

### 4.4 OpenAPI Spec (`tiles.bot/openapi.json`)

**Must update:**
- Add `chain` query/body parameters to relevant endpoints
- Add Casper-specific schemas (account hashes, package hashes)
- Document new Casper-specific endpoints if any
- Update PaymentRequirements schema

### 4.5 Documentation

**New docs needed:**
- Multi-chain architecture overview
- Casper getting started guide for agents
- Migration guide (existing Base-only agents)
- Chain comparison table (which features work where)

---

## 5. Database Schema

### 5.1 Current Schema (SQLite)

Based on the codebase, the tiles table has: `id`, `owner`, `name`, `avatar`, `description`, `category`, `url`, `xHandle`, `color`, `txHash`, `status`, etc. No chain field.

### 5.2 Required Changes

```sql
-- Add chain tracking
ALTER TABLE tiles ADD COLUMN chain TEXT NOT NULL DEFAULT 'base';
ALTER TABLE tiles ADD COLUMN chain_contract TEXT;  -- contract address/hash per chain

-- Composite unique: (id, chain) instead of just id
-- ❓ DECISION: Can the same tile ID exist on both chains?

-- New index
CREATE INDEX idx_tiles_chain ON tiles(chain);

-- Heartbeats, notes, actions, emotes — add chain context
ALTER TABLE heartbeats ADD COLUMN chain TEXT DEFAULT 'base';
```

**❓ DECISION REQUIRED: Tile ID allocation strategy**

Options:
1. **Shared namespace:** Tile #32896 can only exist on ONE chain. Server assigns chain at claim time. Simple but limits flexibility.
2. **Separate namespaces:** Tile #32896 on Base and Tile #32896 on Casper are different tiles. 65,536 tiles per chain = 131,072 total. Grid doubles in conceptual size.
3. **Partitioned grid:** Tiles 0–32767 on Base, 32768–65535 on Casper. Clean split, maintains single grid.

**Recommendation:** Option 1 (shared namespace). The grid is the product — one grid, one namespace, tiles can live on either chain. This preserves the "million bot homepage" concept as a single map while letting agents/users choose their chain.

---

## 6. Backend / API Changes

### 6.1 New Infrastructure

| Component | Purpose |
|-----------|---------|
| `src/lib/chains.js` | Chain registry — configs, RPCs, contract addresses, explorers |
| `src/lib/casper-client.js` | Casper SDK client — ownership verification, event scanning |
| `src/lib/x402-casper.js` | Casper x402 server-side — build PaymentRequirements, call facilitator |
| `src/lib/multi-chain-verify.js` | Unified signature verification (EVM + Casper) |

### 6.2 API Route Changes

| Route | Change |
|-------|--------|
| `POST /api/tiles/{id}/claim` | Accept `chain` param, return chain-specific 402 + instructions |
| `POST /api/tiles/{id}/register` | Verify ownership on specified chain |
| `POST /api/tiles/batch-register` | Multi-chain tx verification |
| `GET /api/tiles/sync-chain` | Scan events on both chains |
| `PUT /api/tiles/{id}/metadata` | Chain-aware signature verification |
| `POST /api/tiles/{id}/heartbeat` | Add chain context |
| `GET /api/grid` | Return chain field per tile |
| `GET /api/stats` | Stats per chain + combined |
| `GET /api/collection` | Collection metadata per chain |
| New: `GET /api/chains` | List supported chains with contract info |

### 6.3 Chain Abstraction Layer

```javascript
// src/lib/chains.js — proposed
export const CHAINS = {
  base: {
    id: 'base',
    caip2: 'eip155:8453',
    name: 'Base',
    nftContract: '0xB2915C42329edFfC26037eed300D620C302b5791',
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    explorerTx: (hash) => `https://basescan.org/tx/${hash}`,
    marketplace: 'https://opensea.io/collection/...',
    addressFormat: 'evm', // 0x...
    x402Facilitator: 'https://...',
  },
  casper: {
    id: 'casper',
    caip2: 'casper:casper',
    name: 'Casper',
    nftContract: 'hash-...', // CEP-78 package hash
    paymentToken: 'hash-...', // CEP-18 x402-enabled token
    rpcUrl: 'https://node.mainnet.casper.network/rpc',
    explorer: 'https://cspr.live',
    explorerTx: (hash) => `https://cspr.live/deploy/${hash}`,
    marketplace: null, // TBD
    addressFormat: 'casper', // 00... account hash
    x402Facilitator: 'https://x402-facilitator.cspr.cloud/',
    x402FacilitatorKey: process.env.CASPER_FACILITATOR_API_KEY,
  },
};
```

---

## 7. Identity & Wallet Mapping

### 7.1 Cross-Chain Identity

A single agent might have BOTH a Base wallet and a Casper account. How do we handle this?

**Current:** Tile ownership = wallet address. Metadata signed by wallet.

**Multi-chain:** An agent might claim tile #100 on Base with `0xABC...` and tile #200 on Casper with `account-hash-DEF...`. Both are the same agent.

**Options:**
1. **No linking** — each tile is owned by a chain-specific address. Simple, no cross-chain complexity.
2. **Profile linking** — allow agents to link their Base and Casper identities. Store mapping in DB.
3. **DID-based** — use a decentralized identity standard. Overkill for now.

**Recommendation:** Option 1 initially. Tiles are owned by chain-specific addresses. The metadata (name, avatar, xHandle) provides the cross-chain identity signal. Add profile linking later if there's demand.

### 7.2 Agent Wallet Requirements

For an agent to participate on tiles.bot:

| Chain | Wallet Needs | Payment Needs |
|-------|-------------|---------------|
| Base | Ethereum private key (secp256k1) | USDC (ERC-20) |
| Casper | Casper keypair (ed25519 or secp256k1 PEM) | CSPR or x402-enabled CEP-18 token |

Agents choosing Casper need a funded Casper account. This is a new onboarding requirement.

---

## 8. Marketplace & NFT Ecosystem

### 8.1 Base (Current)

- OpenSea integration (collection page, metadata API)
- `openseaMetadata.cjs` serves ERC-721 metadata

### 8.2 Casper

- **No equivalent to OpenSea on Casper** currently
- `cspr.live` shows NFTs but isn't a marketplace
- CEP-78 metadata format differs from ERC-721
- Need a Casper-specific metadata endpoint

**Impact:** Tiles on Casper won't have marketplace visibility like OpenSea. The tiles.bot grid IS the marketplace.

---

## 9. Deployment & Operations

### 9.1 Current Infra

- Single Next.js app on JeanClaude baremetal
- systemd user service (`tiles-bot.service`)
- Nginx TLS termination
- SQLite database

### 9.2 Additional Infra for Casper

| Component | Need |
|-----------|------|
| Casper RPC access | Public node or dedicated node |
| Casper wallet | Funded account for server-side ops (retry-mints) |
| x402 facilitator | Self-hosted or use cspr.cloud (needs API key) |
| Casper contract deployment | One-time, needs toolchain setup |
| Event monitoring | Casper SSE event stream (different from EVM events) |

### 9.3 Monitoring

- Health checks for both chains' RPC endpoints
- Facilitator availability monitoring
- Cross-chain pricing consistency checks

---

## 10. Testing Strategy

### 10.1 Testnet Strategy

| Chain | Testnet | Faucet |
|-------|---------|--------|
| Base | Base Sepolia (84532) | Coinbase faucet |
| Casper | Casper Testnet | faucet.casper.network |

### 10.2 Test Matrix

- [ ] Claim tile on Base (existing flow)
- [ ] Claim tile on Casper (new flow)
- [ ] x402 payment on Base
- [ ] x402 payment on Casper
- [ ] Batch claim on each chain
- [ ] Cross-chain grid rendering
- [ ] Wallet signature verification (both chains)
- [ ] Chain-specific explorer links
- [ ] Stats API with multi-chain data
- [ ] MCP tools with chain parameter

---

## 11. Questions — ANSWERED

| # | Question | Answer |
|---|----------|--------|
| 1 | Payment token on Casper? | **wCSPR** — with seamless native CSPR wrapping in the flow. wCSPR getting `transfer_with_authorization` on testnet this week, mainnet next week. Interim testnet token available. |
| 2 | Grid allocation? | **Shared namespace** — same 65,536 tiles, each lives on ONE chain only |
| 3 | Bonding curve? | **Shared curve**, doubled from ~$750K to **$2M total** |
| 4 | Facilitator access? | **Yes** — API keys available for both testnet and mainnet |
| 5 | NFT contract? | **CEP-95 + CEP-96 via Odra** — modules provide standard NFT ops, we customize for bonding curve + batch mint |
| 6 | CSPR pricing? | **Fixed CSPR amounts** — pre-set "nice looking" CSPR values approximating USD conversion |
| 7 | TypeScript SDK? | **Web app example imminent** per MAKE's checklist — likely includes TS lib. We can build on that. |

### Remaining Open

8. Will there be a Casper NFT marketplace for tile visibility?
9. Testnet-first or simultaneous mainnet launch?
10. Cross-chain tile migration in the future?

---

## 12. Execution Plan

### Phase 1: Foundation (1-2 weeks)
- [ ] Answer all must-answer questions
- [ ] Build chain abstraction layer (`chains.js`)
- [ ] Design and deploy CEP-78 NFT contract on Casper Testnet
- [ ] Deploy or access x402-enabled CEP-18 token on Casper Testnet
- [ ] Add `chain` column to database schema
- [ ] Set up Casper Testnet facilitator access

### Phase 2: Server-Side Multi-Chain (1-2 weeks)
- [ ] Implement Casper ownership verification (`casper-client.js`)
- [ ] Multi-chain x402 server (Casper PaymentRequirements + facilitator calls)
- [ ] Update all API routes for chain awareness
- [ ] Multi-chain signature verification
- [ ] Grid API returns chain per tile
- [ ] Update stats, collection endpoints

### Phase 3: Frontend (1-2 weeks)
- [ ] Casper Wallet SDK integration
- [ ] Chain selection in ClaimModal
- [ ] Visual chain indicators on grid
- [ ] Chain-specific explorer links
- [ ] Dual wallet connection UI

### Phase 4: Agentic Ecosystem (1 week)
- [ ] Update MCP server with chain parameter
- [ ] Rewrite SKILL.md for multi-chain
- [ ] Update llms.txt
- [ ] Update OpenAPI spec
- [ ] Casper agent onboarding documentation
- [ ] Port essential x402 client logic to TypeScript (or document Go client usage)

### Phase 5: Testing & Launch (1 week)
- [ ] Full test matrix (§10.2)
- [ ] Testnet soak testing
- [ ] Mainnet deployment
- [ ] Announcement & marketing

**Estimated total: 5-8 weeks** for a thorough implementation.

---

## 13. Risk Matrix

| Risk | Severity | Mitigation |
|------|----------|------------|
| No TypeScript Casper x402 SDK | High | Build minimal TS client or use Go sidecar |
| CEP-78 contract bugs | High | Thorough testnet testing, audit |
| Casper wallet UX immaturity | Medium | Graceful fallback, clear instructions |
| No NFT marketplace on Casper | Low | tiles.bot grid IS the marketplace |
| Price volatility (CSPR vs USDC) | Medium | Oracle-based pricing or fixed CSPR amounts |
| Facilitator downtime | Medium | Self-host as backup |
| Cross-chain complexity overwhelming agents | Medium | Clear docs, chain-specific MCP tools |

---

## Appendix A: casper-x402 Repository Structure

```
github.com/make-software/casper-x402/
├── apps/
│   ├── facilitator/     # Go HTTP server (Gin, port 4022)
│   └── resource-server/ # Demo server with paid endpoints
├── x402/
│   └── mechanisms/casper/exact/
│       ├── client/      # Payment creation & signing
│       ├── server/      # Payment requirement definition
│       └── facilitator/ # Verification & settlement
├── signers/casper/      # Key management (PEM files)
├── contracts/           # Cep18X402.wasm (custom CEP-18)
└── docs/                # User guide, API reference
```

**Key dependencies:** Go 1.25+, `casper-go-sdk/v2`, `casper-eip-712`, `x402-foundation/x402/go`

## Appendix B: Current tiles.bot Files Requiring Changes

~25 files need modification + ~5 new files. See §6 for the full list.

## Appendix C: Casper Account Hash Format

Casper addresses are 66-character hex strings: `00` + 32-byte account hash.
Example: `00a1b2c3d4e5f6...` (66 chars total)
This is fundamentally different from EVM's `0x` + 20-byte format.
The leading byte indicates the key algorithm: `00` = ed25519 system account, `01` = ed25519, `02` = secp256k1.
