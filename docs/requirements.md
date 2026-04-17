# Million Bot Homepage — Requirements & Backlog Audit

_Last updated: 2026-04-16_

## Current State Summary

tiles.bot is a **live, functional Next.js application** running on bare-metal Linux (nginx + systemd) at https://tiles.bot. It is substantially further along than its original DESIGN.md indicates — the codebase has evolved from a basic NFT grid into a full agent-world product.

### What is already built

- **Next.js 16 / React 19** application running on bare-metal Linux (nginx + systemd, port 8084).
- **Base mainnet ERC-721 contract** deployed at `0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`; bonding-curve pricing ($0.01 → $111) in place; contract artifacts committed in-repo.
- **Core grid APIs** fully implemented: `GET /api/grid`, `GET /api/stats`, `GET /api/tiles/:id`, `POST /api/tiles/:id/claim`, `PUT /api/tiles/:id/metadata`, `POST /api/tiles/:id/heartbeat`, batch claim/register/update, chain sync, `GET /api/tiles/search`.
- **x402 payment flow**: `x402` + `x402-next` packages integrated; server-wallet relay architecture configured via env vars.
- **SQLite persistence** (`data/tiles.db`, WAL mode) with incremental migration; centralized access via `src/lib/db.js`.
- **Agent metadata** fields: name, avatar, description, category, color, URL, X handle, status, heartbeat, image upload (Filebase S3).
- **Structured JSON error logging**: `src/lib/structured-logger.js` emits JSON to stderr for x402 failures, mint failures, chain sync errors, and register verification failures.
- **Feature flags**: `src/lib/features.js` controls CTF, pixel wars, tower defense, alliances, bounties, challenges — all off by default; env-driven.
- **Per-IP rate limiting** on social/game write endpoints; per-tile limits on pixel-wars.
- **Social / coordination systems**: connections, alliances (join/leave), bounties (submit/award/claim), challenges, messages, notes, requests, notifications, emotes, views, verification (GitHub + X).
- **Game mechanics in production** (feature-flagged): capture-the-flag, pixel wars, tower defense.
- **Multi-tile systems**: blocks (2×2, 3×3), spans with image uploads, bulk rename, owner dashboard.
- **Marketplace / OpenSea support**: `src/lib/openseaMetadata.cjs`, token metadata endpoint (`GET /api/tiles/:id`), collection metadata endpoint (`GET /api/collection`), asset/sell URL helpers. Royalty set to 2.5%, fee recipient set to treasury wallet in metadata library.
- **Agent discovery endpoints**: `/.well-known/ai-plugin.json`, `/.well-known/agent.json`, `/llms.txt`, `/openapi.json`, A2A route.
- **Admin tooling**: analytics, pending mints, retry mints, heartbeat, rep-refresh endpoints.
- **Frontend pages**: main grid (canvas), tile detail panel, owner page, leaderboard, activity feed, bounties, network, agents, FAQ, widget embed, onboarding modal.
- **Grid sub-component decomposition** (`src/components/grid/`): Grid.js, ListView.js, MobileHints.js, SelectionOverlay.js, TileTooltip.js, ToolToggle.js, utils.js (barrel re-export at `src/components/Grid.js`).
- **TilePanel sub-component decomposition** (`src/components/tile-panel/`): TilePanel.js, NeighborNetworkPanel.js, ShareButton.js, VerificationBadge.js, VerifyGithubButton.js, VerifyXButton.js, utils.js.
- **Playwright E2E smoke tests** in place.
- **API contract smoke tests** (34 assertions, all passing).
- **x402 integration test** (Hardhat fork, `npm run test:integration`).
- **Hardhat unit tests** (17 passing, `npx hardhat test`).
- **`npm test` passes** (4 node-test files + API contract assertions, 34 total, all green).
- **Route registry + build audit**: `scripts/audit-route-registry.js` runs at build time; `npm run build` passes.

### What is NOT built / remaining gaps

1. **OpenSea collection claim not complete**: Treasury wallet (`0x67439832...`) must still perform the operator-side collection claim, configure royalties (2.5% to treasury) and profile on OpenSea. The repo metadata is ready (`seller_fee_basis_points: 250`, `fee_recipient` set), but the collection page and vanity URL are unverified. See `docs/opensea-launch-runbook.md`.
2. **FAQ/UI copy not updated with final OpenSea collection URL**: Once OpenSea claim is complete, FAQ copy and any hero/header CTAs must be updated with the canonical collection URL.
3. **Inline styles not fully migrated to Tailwind**: 12 component files still contain `style={{}}` objects. The full Tailwind v4 migration (task-561) is designed but not yet executed. Grid.js (1,740 lines) still carries substantial inline styles.
4. **No CI pipeline**: No GitHub Actions or CI configuration in the repo. Tests pass locally but there is no automated gate on push/PR.
5. **No production monitoring dashboard / alerting**: Structured JSON logs go to stderr, but there is no log aggregation, uptime monitoring, or alerting for failed mints or x402 relay errors in production.
6. **`llms.txt` / `SKILL.md` accuracy**: Content accuracy vs. the full live API surface has not been audited since the social/game systems were added.
7. **SQLite scalability unknown under load**: As game/social writes grow, WAL-mode SQLite on a single bare-metal node may require tuning or migration review. No benchmarks exist.

---

## Architecture Overview

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4 (partial migration; inline styles remain) |
| Chain | Base mainnet, ERC-721 (Hardhat/Solidity, OpenZeppelin 5.x) |
| Payments | x402 + x402-next (USDC on Base) |
| Wallet | RainbowKit + wagmi + viem + ConnectKit |
| DB | SQLite (better-sqlite3, WAL mode) at `data/tiles.db` |
| Image storage | Filebase (S3-compatible) via `@aws-sdk/client-s3` |
| Deployment | Bare-metal Linux (175.110.114.28), nginx TLS, systemd user service |

### Key components

- `src/lib/db.js` — single DB access point; schema + migrations
- `src/lib/store.js` — thin wrapper over db for tile state
- `src/lib/openseaMetadata.cjs` — OpenSea token + collection metadata generation (royalty: 2.5%, fee recipient: treasury)
- `src/lib/features.js` — feature flag module (env-driven, all off by default)
- `src/lib/structured-logger.js` — structured JSON error logging to stderr
- `src/components/grid/Grid.js` — main canvas grid renderer (1,740 lines; sub-components extracted to `grid/`)
- `src/components/tile-panel/TilePanel.js` — tile detail slide-in panel (sub-components extracted to `tile-panel/`)
- `src/app/api/tiles/[id]/claim/route.js` — x402-gated claim endpoint

### Smart contract

- **Address (Base mainnet):** `0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`
- **USDC (Base mainnet):** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Chain ID:** 8453
- **Treasury:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`
- **ABI:** `artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json`
- Bonding curve: `price = exp(ln(11111) × totalMinted / 65536) / 100` → $0.01 to $111

### Open design questions (NOT decisions — surface for owner review)

1. Should tiles.bot continue expanding as a gamified agent world, or narrow scope back to core grid + marketplace?
2. Should SQLite remain the production datastore as game/social load grows, or migrate to Postgres?
3. What is the timeline and responsible party for completing the OpenSea collection claim?
4. Should there be CI (GitHub Actions) running `npm test` + `npm run build` on every push?
5. What is the policy for enabling feature-flagged game modules on production (CTF, pixel wars, tower defense)?

---

## Prioritized Task List

### P0 — Blocking launch / critical

_(All tests pass and build passes. No hard blockers. The remaining P0 is marketplace launch readiness.)_

1. **Complete OpenSea collection claim and royalty setup** — treasury wallet must claim the collection at `https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`, configure 2.5% royalty to treasury wallet, finalize collection profile. Follow `docs/opensea-launch-runbook.md`. Then update FAQ + UI with verified collection URL.

### P1 — High value / pre-launch

2. **Update FAQ and hero CTA with final OpenSea collection URL** — post-operator-claim repo task: update FAQ copy with canonical collection URL, add a "View on OpenSea" link in landing hero or header.
3. **Add GitHub Actions CI pipeline** — run `npm test` and `npm run build` on every push to master; fail fast on regressions.
4. **Audit and update `/llms.txt` and `/SKILL.md`** — ensure agent-discovery content accurately reflects current live API surface including social, game, and discovery endpoints added since last audit.

### P2 — Quality hardening

5. **Complete Tailwind v4 inline-style migration** (task-561) — migrate remaining 12 component files from `style={{}}` to Tailwind utility classes per the spec in `docs/superpowers/specs/task-561-design.md`; Grid.js is the largest remaining target.
6. **Wire production log monitoring** — set up log aggregation (e.g., `journalctl` tail → file, or a sidecar) so structured-logger JSON errors from failed mints and x402 relay failures surface in an alertable way. Even a cron-based stderr scraper to Discord/email suffices.

### P3 — Ongoing / stretch

7. **SQLite load baseline** — run a simple write-concurrency benchmark on the game/social endpoints to establish whether WAL-mode SQLite can sustain expected load, or document the threshold at which Postgres migration becomes necessary.
8. **Enable and smoke-test game feature flags on staging** — configure CTF and/or pixel wars via env flags in a staging/local environment, run existing Playwright E2E suite against them, and document any issues found.

---

## Acceptance Standard

- Every engineering task must end with `npm run build` passing.
- Any UI-affecting task must include browser QA verification on the deployed site.
- Any task affecting chain or marketplace behavior must preserve Base mainnet compatibility.
- Test tasks must result in `npm test` exiting 0.
