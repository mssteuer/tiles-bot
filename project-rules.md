# tiles.bot — Project Rules

## Overview
tiles.bot is the **multi-chain AI Agent Grid**: a 256×256 canvas of NFT tiles on **Base and Casper** where AI agents and bots claim their spot on the internet. Each tile is an NFT (ERC-721 on Base, CEP-95 on Casper), priced via exponential bonding curves (independent per chain), purchasable via WalletConnect, CSPR.click, or x402 (agentic payments).

**Live site:** https://tiles.bot  
**GitHub:** https://github.com/mssteuer/tiles-bot  
**CCC project:** million-bot-homepage  
**Multi-chain analysis:** docs/MULTI-CHAIN-ANALYSIS.md  

## Tech Stack

### Shared
- **Frontend:** Next.js 16, React 19, HTML Canvas (tile grid), Tailwind CSS
- **Backend:** Next.js API routes, better-sqlite3 (tile metadata cache)
- **Payments:** x402 (agentic/automated on both chains)
- **Deployed on:** bare metal server (175.110.114.28), nginx TLS termination
- **Domain:** tiles.bot (SSL via certbot)
- **Chain abstraction:** `src/lib/chains.js` — centralized registry for all chain-specific config

### Base (EVM)
- **Wallet:** ConnectKit + wagmi v3 (browser), ethers.js (server)
- **Smart contract:** Solidity ERC-721, Hardhat toolchain
- **Payment token:** USDC (ERC-20)
- **Chain ID:** 8453 (mainnet), 84532 (Base Sepolia testnet)
- **Explorer:** basescan.org
- **Marketplace:** OpenSea

### Casper
- **Wallet:** CSPR.click SDK (@make-software/csprclick-ui)
- **Smart contract:** Rust CEP-95/96 via Odra framework (v2.7+)
- **Payment token:** wCSPR (CEP-18 with x402 transfer_with_authorization)
- **Network:** casper (mainnet), casper-test (testnet), CAIP-2: `casper:casper`
- **Explorer:** cspr.live
- **x402 facilitator:** x402-facilitator.cspr.cloud (API key required)
- **Marketplace:** None (the grid IS the marketplace)
- **Local dev:** casper-devnet (see Testing section)

## Architecture
```
tiles.bot (nginx + TLS)
  └── Next.js app (port 8084, systemd: tiles-bot.service)
        ├── /api/grid       — full grid state (tiles from BOTH chains)
        ├── /api/stats      — live stats per chain + combined
        ├── /api/chains     — supported chains with contract addresses
        ├── /api/tiles/:id  — single tile detail (includes chain field)
        ├── /api/tiles/:id/claim    — x402 payment (Base OR Casper)
        ├── /api/tiles/:id/register — verify on-chain ownership + register
        ├── /api/tiles/:id/heartbeat — agent status ping
        ├── /api/tiles/:id/image    — upload tile image
        ├── /api/tiles/:id/metadata — update tile metadata (wallet sig)
        ├── /api/tiles/batch-register — batch claim verification
        ├── /SKILL.md       — agent discovery
        ├── /llms.txt       — LLM-readable API summary
        └── /openapi.json   — OpenAPI spec
```

## Smart Contracts

### Base (ERC-721)
- **Contract:** `0xB2915C42329edFfC26037eed300D620C302b5791`
- **USDC:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Chain ID:** 8453
- **Treasury:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`
- **ABI:** `artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json`
- Key functions: `claim(tokenId)`, `batchClaim(tokenIds[])`, `currentPrice()`
- Bonding curve: `price = exp(ln(11111) × totalMinted / 65536) / 100` → $0.01 to $111
- **Toolchain:** Hardhat, Solidity 0.8.28

### Casper (CEP-95/96)
- **Contract:** `contracts/casper/` (Odra framework, Rust)
- **Standard:** CEP-95 (NFT) + CEP-96 (collection metadata)
- **Payment:** wCSPR (CEP-18 with transfer_with_authorization for x402)
- Key entry points: `claim(token_id)`, `batch_claim(token_ids)`, `current_price()`
- Bonding curve: **Same formula as Base** (independent per chain)
- **Toolchain:** cargo-odra, wasm-opt, wabt (wasm-strip)
- **Build:** `cd contracts/casper && cargo odra build`
- **Test:** `cd contracts/casper && cargo test`

### Bonding Curve (both chains)
```
price = exp(ln(11111) × totalMinted / 65536) / 100
```
- Each chain has its own independent curve
- Each chain tracks its own `totalMinted`
- Range: 0.01 → 111.11 (in USD on Base, in CSPR on Casper)
- Pricing is fully on-chain — no server oracle dependency

## Database
- **Runtime file:** `data/tiles.db` (SQLite, WAL mode) — gitignored, never commit
- **Override:** `DB_DIR` env var can change the parent directory; default remains `data/`
- **Key fields:** id, owner, chain, chain_contract, name, avatar, description, category, color, status, url, x_handle, claimed_at, last_heartbeat, price_paid, image_url
- **Chain field:** TEXT NOT NULL DEFAULT 'base' — identifies which chain the tile lives on
- **Constraint:** Tile ID is unique across chains (shared namespace)
- **Migration:** Schema created/updated on startup via `src/lib/db.js`

## Build & Deploy
```bash
npm run build                        # Next.js production build (MANDATORY before restart)
systemctl --user restart tiles-bot   # restart the live service
```
- Service file: `~/.config/systemd/user/tiles-bot.service` (port 8084)
- Dev service: `~/.config/systemd/user/million-bot-dev.service` (port 8085)
- **Hard rule: run `npm run build` and verify it passes BEFORE marking any task done**
- ⚠️ Service name is `tiles-bot` — NOT `million-bot` (old alias)

## Coding Conventions
- **JavaScript only** — no TypeScript in this project (Next.js JS mode)
- **No `"use client"` directives** on API routes — they are server-side
- Canvas rendering lives in `src/components/Grid.js` — keep all canvas logic there
- DB access only through `src/lib/db.js` — never access SQLite directly from routes
- Chain-specific logic goes through `src/lib/chains.js` — never hardcode chain constants
- Environment variables: `NEXT_PUBLIC_*` for frontend, plain `process.env.*` for server
- **Never hardcode wallet addresses, contract addresses, or RPC URLs** — always via chains.js or env vars
- Chain env vars follow the pattern: `CHAIN_BASE_*` and `CHAIN_CASPER_*`

## Section Dividers — CRITICAL
**NEVER use `=====` or `-----` style section dividers in code.** Use `// — Section Name` instead.
Bad: `// ======= HANDLERS =======`  
Good: `// — Handlers`
Agents confuse `====` and `----` with git merge conflict markers and corrupt files.

## Testing — MANDATORY

### Browser QA (UI tasks)
- **Every task that touches UI MUST include browser QA using the browser tool before marking done.**
- Browser QA is not optional and not a stretch goal — it is a required step.
- Steps for every UI task:
  1. `npm run build` passes ✅
  2. `systemctl --user restart tiles-bot` ✅
  3. Open https://tiles.bot in the browser tool (take a screenshot)
  4. Verify the specific feature changed/added visually
  5. Test any interactive elements (clicks, modals, form inputs)
  6. Screenshot the final working state
  7. Only mark CCC task done AFTER screenshots confirm it works
- If the browser tool is unavailable, note this explicitly and do NOT mark done.

### Contract Tests — Base (EVM)
```bash
npx hardhat test   # Mocha/Chai tests in test/
```

### Contract Tests — Casper
```bash
cd contracts/casper
cargo test         # Odra unit tests (mock environment)
```

### Local Casper Blockchain — casper-devnet
For integration testing with a real Casper node, use **casper-devnet** (by Michal Papierski, Casper Core Dev):

**Install:**
```bash
cargo install casper-devnet --locked
# OR via Docker:
docker pull ghcr.io/veles-labs/casper-devnet
```

**Run:**
```bash
casper-devnet start                     # starts local 1-node network
# OR with Docker:
docker run -d -p 7777:7777 -p 18101:18101 ghcr.io/veles-labs/casper-devnet
```

**Key features:**
- Single binary, downloads pre-built assets (no source compilation)
- Deterministic BIP32 accounts (predictable test keys)
- Chainspec overrides for custom settings
- RPC at `http://localhost:7777/rpc`, SSE at port 18101
- Built-in MCP server for AI/LLM workflows
- Much faster setup than NCTL (2-5 min vs 30-60 min)

**GitHub:** https://github.com/veles-labs/casper-devnet

**When to use:**
- Testing contract deployment and entry point calls
- End-to-end x402 flow with local facilitator
- Verifying wCSPR interactions
- CI pipeline (Docker image available)

**Alternative: NCTL** (official Casper test tool) — heavier, requires building casper-node from source, more suited to protocol-level testing. Use casper-devnet for application development.

### Integration Tests (Node.js)
```bash
npm test           # node:test suite in test/
```
- `test/api-contract.node-test.js` — hits localhost:8084 (needs running server, skips gracefully in CI)
- `test/marketingCopy.node-test.js` — asserts on LandingHero strings (update both together)

## Git & CCC
- **Remote:** `https://github.com/mssteuer/tiles-bot.git`
- **Token:** Use `$GITHUB_TOKEN_PUBLIC_REPOS` env var (or `~/.hermes/.secrets/` fallback)
- **Branch strategy:** Feature branches (`feat/...`) → PR → merge to master
- Mark CCC tasks `in_progress` when starting, `done` only after build passes + browser QA
- **Dependencies:** Use `task_dependencies` table in CCC — dispatcher respects them

## CI (GitHub Actions)
Workflow `.github/workflows/ci.yml` runs on push to master:
1. `npm ci` — requires `.npmrc` with `legacy-peer-deps=true`
2. `npm test` — sequential node test files
3. `npm run build` — Next.js production build

**Known CI gotchas:**
- `.npmrc` required (rainbowkit ↔ wagmi@3 peer dep conflict)
- `marketingCopy.node-test.js` asserts on specific strings — update test + source together
- `api-contract.node-test.js` skips gracefully when server isn't running
- All test files must be tracked in git

## npm install pitfall
The project has `@rainbow-me/rainbowkit@2.x` requiring `wagmi@^2.9.0`, but uses `wagmi@^3.6.0`. Always:
```bash
npm install <package>@<version> --legacy-peer-deps
```

## Important Notes
- `data/` directory is gitignored — contains live `tiles.db` and runtime files
- `.env.local` is gitignored — contains private keys and payment config; **never commit**
- `node_modules/` is gitignored
- The `artifacts/` directory IS committed (Solidity ABI needed at runtime)
- Grid namespace is shared: a tile ID (0-65535) can only exist on ONE chain
- Tile's `chain` field determines which blockchain to query for ownership verification
- Heartbeat = agent is online: POST /api/tiles/:id/heartbeat
- Online threshold: <5 min = green glow, 5-30 min = yellow glow, >30 min = no glow

## ⚠️ CRITICAL: Never commit binary files or node_modules

- **NEVER run `git add .` or `git add -A`** — always stage files explicitly
- **NEVER commit `node_modules/`, `*.node`, or `.next/`**
- `*.node` binary addon files exceed GitHub's 100MB limit and BLOCK pushes
- Before any `git commit`, run `git diff --cached --name-only` to verify
- Safe staging: `git add src/ docs/ contracts/ *.json *.md`

## Environment Variables

### Chain-specific (loaded by src/lib/chains.js)
```
CHAIN_BASE_NFT_CONTRACT=0xB2915C42329edFfC26037eed300D620C302b5791
CHAIN_BASE_PAYMENT_TOKEN=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CHAIN_BASE_TREASURY=0x67439832C52C92B5ba8DE28a202E72D09CCEB42f
CHAIN_BASE_RPC_URL=https://mainnet.base.org
CHAIN_BASE_EXPLORER=https://basescan.org
CHAIN_BASE_X402_FACILITATOR=...

CHAIN_CASPER_NFT_CONTRACT=hash-...
CHAIN_CASPER_PAYMENT_TOKEN=hash-... (wCSPR)
CHAIN_CASPER_TREASURY=01... (Casper account hash)
CHAIN_CASPER_RPC_URL=https://node.mainnet.casper.network/rpc
CHAIN_CASPER_EXPLORER=https://cspr.live
CHAIN_CASPER_X402_FACILITATOR=https://x402-facilitator.cspr.cloud/
CASPER_FACILITATOR_API_KEY=...
DEFAULT_CHAIN=base
```

### General
```
NEXT_PUBLIC_CHAIN_ID=8453
DB_DIR=data
```
