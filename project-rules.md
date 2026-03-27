# tiles.bot — Project Rules

## Overview
tiles.bot is the AI Agent Grid: a 256×256 canvas of NFT tiles on Base where AI agents and bots claim their spot on the internet. Each tile is an ERC-721 NFT, priced via exponential bonding curve ($0.01 → $111), purchasable via WalletConnect or x402 (agentic payments).

**Live site:** https://tiles.bot  
**GitHub:** https://github.com/mssteuer/tiles-bot  
**CCC project:** million-bot-homepage  

## Tech Stack
- **Frontend:** Next.js 16, React 19, HTML Canvas (tile grid), RainbowKit + wagmi v2 (wallet)
- **Backend:** Next.js API routes, better-sqlite3 (tile metadata cache)
- **Smart contract:** Solidity ERC-721 on Base mainnet, Hardhat toolchain
- **Payments:** x402 (agentic/automated), WalletConnect USDC (human)
- **Styling:** Tailwind CSS
- **Deployed on:** bare metal server (175.110.114.28), nginx TLS termination
- **Domain:** tiles.bot (SSL via certbot)

## Architecture
```
tiles.bot (nginx + TLS)
  └── Next.js app (port 8084, systemd: million-bot.service)
        ├── /api/grid       — full grid state (all claimed tiles + metadata)
        ├── /api/stats      — live stats (claimed count, current price)
        ├── /api/tiles/:id  — single tile detail
        ├── /api/tiles/:id/claim    — x402 payment → record claim
        ├── /api/tiles/:id/heartbeat — agent status ping (online/offline indicator)
        ├── /api/tiles/:id/image    — upload tile image (PNG/JPG/WebP → 256×256)
        ├── /api/tiles/:id/metadata — update tile metadata (owner-only, wallet sig)
        ├── /api/tiles/batch-claim  — claim multiple adjacent tiles atomically
        ├── /SKILL.md       — agent discovery (OpenClaw skill format)
        ├── /llms.txt       — LLM-readable API summary
        └── /.well-known/ai-plugin.json — ChatGPT plugin manifest
```

## Smart Contract
- **Address (Base mainnet):** `0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`
- **USDC (Base mainnet):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Chain ID:** 8453
- **Treasury:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`
- **ABI:** `artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json`
- Key functions: `claim(tokenId)`, `batchClaim(tokenIds[])`, `setTileURI(tokenId, uri)`
- Bonding curve: `price = exp(ln(11111) × totalMinted / 65536) / 100` → $0.01 to $111

## Database
- **File:** `data/tiles.db` (SQLite, WAL mode) — gitignored, never commit
- **Schema key fields:** id, owner, name, avatar, description, category, color, status, url, x_handle, claimed_at, last_heartbeat, price_paid, image_url
- **Migration:** Schema created/updated on startup via `db.js` CREATE TABLE IF NOT EXISTS + ALTER TABLE for new columns

## Build & Deploy
```bash
npm run build          # Next.js production build
sudo systemctl restart million-bot   # restart the live service
```
- Service file: `/home/jeanclaude/.config/systemd/user/million-bot.service`
- After code changes: always rebuild before restarting
- **Hard rule: run `npm run build` and verify it passes BEFORE marking any task done**

## Coding Conventions
- **JavaScript only** — no TypeScript in this project (Next.js JS mode)
- **No `"use client"` directives** on API routes — they are server-side
- Canvas rendering lives in `src/components/Grid.js` — keep all canvas logic there
- DB access only through `src/lib/db.js` — never access tiles.db directly from components
- Environment variables: use `process.env.NEXT_PUBLIC_*` for frontend, plain `process.env.*` for server
- Never hardcode wallet addresses or contract addresses — always use env vars

## Section Dividers — CRITICAL
**NEVER use `=====` or `-----` style section dividers in code.** Use `// — Section Name` instead.
Bad: `// ======= HANDLERS =======`  
Good: `// — Handlers`
Agents confuse `====` and `----` with git merge conflict markers and corrupt files.

## Testing
- Contract tests: `npx hardhat test` (Mocha/Chai, in `test/`)
- No frontend test framework currently — do browser QA with the browser tool
- When doing browser QA: navigate to https://tiles.bot and verify visually

## Git & CCC
- **Remote:** `https://github.com/mssteuer/tiles-bot.git`
- **Token:** `~/.openclaw/workspace/.secrets/github-token-mssteuer.txt`
- **Branch:** `master` (single branch, no PRs for now — direct push to master)
- Set remote URL with token before pushing:  
  `git remote set-url origin "https://$(cat ~/.openclaw/workspace/.secrets/github-token-mssteuer.txt)@github.com/mssteuer/tiles-bot.git"`
- Mark CCC tasks in_progress when starting, done only after build passes + browser QA

## Important Notes
- `data/` directory is gitignored — contains tiles.db and uploaded images
- `.env.local` is gitignored — contains private key and payment config; **never commit**
- `node_modules/` is gitignored — the git history was squashed to remove it
- The `artifacts/` directory IS committed (Solidity build artifacts + ABI needed at runtime)
- OpenSea link format: `https://opensea.io/assets/base/{CONTRACT_ADDRESS}/{tokenId}`
- Heartbeat = agent is online: POST /api/tiles/:id/heartbeat updates last_heartbeat timestamp
- Online threshold: <5 min = green glow, 5-30 min = yellow glow, >30 min = no glow
