# tiles.bot — Atomic Feature Inventory & Test Matrix

> Generated 2026-07-05 by codebase crawl of `/home/jeanclaude/workspace/million-bot-homepage`
> (src/app/api — 86 registered routes, src/lib, src/components, packages/mcp, packages/casper-x402-client, contracts/).
> Purpose: gates the full E2E test campaign before the fresh-contracts blank-DB launch and feeds the
> UI-tightening pass (single-chain sessions, revenue-tracker removal, chain-correct address/explorer/marketplace display).
>
> Legend for the **Tests** column: cited file lives in `test/` unless prefixed. `NONE` = zero automated coverage.
> Chain column: 🟢 chain-aware, 🟡 partially chain-aware / needs verification, 🔴 suspected Base-only.

## 1. Claiming & On-Chain Lifecycle

| # | Feature | Code location(s) | Tests | Unit test | Agentic/API test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|------------------|---------|----------------|
| 1 | Base x402/USDC claim (402 → pay → instructions) | `src/app/api/tiles/[id]/claim/route.js`, `src/lib/pricing.js` | `claim-route-casper.node-test.js` (routing), `x402-integration.js`, `api-contract.node-test.js` | Mock x402 middleware, assert 402 body shape + PaymentRequirements | `POST /api/tiles/:id/claim` on tiles-dev, verify 402 → X-Payment replay → 200 instructions | ClaimModal full flow with test wallet on tiles-dev | 🟢 default chain=base; verify default doesn't swallow explicit casper param |
| 2 | Casper x402/wCSPR claim (motes PaymentRequirements) | same route + `src/lib/casper-x402.js` | `casper-x402-handler.node-test.js`, `claim-route-casper.node-test.js`, `casper-x402-e2e.node-test.js` | Handler tests: PaymentRequirements builder, facilitator client, timeouts, domain version 1 | `POST /api/tiles/:id/claim?chain=casper` → Casper 402 shape, X-Payment replay via facilitator | ClaimModal Casper path w/ CSPR.click on dev | 🟢 well tested; preserve facilitator timeouts + chainName from chain config |
| 3 | Chain selection (query `chain=`, `X-Chain`/`X-Tiles-Chain` headers, body chain) | `src/lib/chain-api.js` | `chain-api.node-test.js` | Existing unit tests cover parsing precedence | Send conflicting query vs header, assert precedence | n/a | 🟢 |
| 4 | Batch claim (x402, progressive batch pricing) | `src/app/api/tiles/batch-claim/route.js`, `db.getBatchPriceByChain` | `full-multichain-integration.node-test.js` (partial) | Unit-test batch price math per chain | `POST /api/tiles/batch-claim` both chains, assert per-chain price sums | BatchClaimModal on dev | 🟡 verify casper motes pricing in batch path |
| 5 | Register (tx/deploy verification → DB claim) | `src/app/api/tiles/[id]/register/route.js` | `full-multichain-integration.node-test.js` (partial) | Mock RPC receipt / deploy lookup, assert DB write incl. `chain`, `chain_contract` | Register with `txHash`+`chain=base` and `deployHash`+`chain=casper` | Implicit in claim modals | 🟡 verify Casper deployHash validation path parity (event parsing, wrong-tile deploy rejection) |
| 6 | Batch register (parse batchClaim tx → N tiles) | `src/app/api/tiles/batch-register/route.js` | NONE | Mock receipt with Transfer/Claimed events, assert N rows | `POST /api/tiles/batch-register {txHash}` on dev | BatchClaimModal completion step | 🔴 verify Casper `batch_claim` deploy parsing exists — likely EVM-log-only |
| 7 | Batch metadata update (signed, ≤1000 tiles) | `src/app/api/tiles/batch-update/route.js` | NONE | Sig message format `tiles.bot:batch-update:{ids}:{ts}`, ownership check per tile | Sign+POST for owned tiles, assert partial-failure semantics | BulkRenamePanel / OwnerDashboardBulkRename | 🟡 depends on verify-wallet-sig Casper branch — must test Casper-signed batch |
| 8 | Sync-chain (reconcile on-chain state → DB) | `src/app/api/tiles/sync-chain/route.js` | NONE | Mock chain reads, assert DB reconciliation | `POST /api/tiles/sync-chain` on dev | n/a | 🔴 audit: does it enumerate CEP-95 tokens or only ERC-721? |
| 9 | Check owner (REST/on-chain parity) | `src/app/api/tiles/[id]/check-owner/route.js` | NONE (MCP wrapper covered in `packages/mcp/test/multichain.test.ts`) | Mock ownerOf + DB, assert precedence | `GET /api/tiles/:id/check-owner` for base & casper tiles | n/a | 🔴 `verifyTileOwnership` on-chain path is **EVM-only** (`parseAbi ownerOf(uint256)`); Casper always falls to DB — no CEP-95 `owner_of` query |
| 10 | Pending mints admin + retry | `src/app/api/admin/pending-mints/route.js`, `admin/retry-mints/route.js` | NONE | Mock stuck-mint rows, assert retry semantics | Admin-token curl on dev | n/a | 🟡 retry must dispatch per-chain (deploy vs tx) |
| 11 | Bonding curve pricing (per-chain independent curves) | `src/lib/pricing.js`, `src/lib/db.js` (`getCurrentPriceByChain`, `getBatchPriceByChain`) | `bondingCurveMilestones.node-test.js`, `bonding-curve-parity.node-test.js` | Existing milestone tests vs `docs/CSPR-PRICING-MILESTONES.md` | `GET /api/stats` perChain prices after claims on dev | Header/StatsPanel price display | 🟢 tested incl. motes conversion; keep test↔doc lockstep |
| 12 | Multichain DB schema (`chain`, `chain_contract`, indices) | `src/lib/db.js` `initSchema()` | `multichain-schema.node-test.js` (8 tests) | Existing | Claim on each chain, `GET /api/tiles/:id` returns chain | n/a | 🟢 |
| 13 | Per-chain stats aggregation (`getPerChainStats`) | `src/lib/db.js` | `full-multichain-integration.node-test.js` (partial) | Seed both chains, assert GROUP BY output | `GET /api/stats` `.perChain` | StatsPanel | 🟢 |
| 14 | Base ERC-721 contract (claim/batchClaim/bonding curve) | `contracts/MillionBotHomepage.sol` | `MillionBotHomepage.test.js` (hardhat) | Existing hardhat suite | n/a | n/a | 🟢 Base-scoped by design |
| 15 | Casper CEP-95 Odra contract (claim/batch_claim/curve/wCSPR) | `contracts/casper/src/*.rs` | `contracts/casper/tests/` (Rust) | `cargo test` in contracts/casper | Devnet deploy + claim via casper-devnet | n/a | 🟢 Casper-scoped; verify non_reentrant + curve parity test vs JS |
| 16 | Casper x402 TS client SDK | `packages/casper-x402-client/src/*` | `packages/casper-x402-client/test/client.test.ts` | Existing; extend for signer edge cases | Use client against dev facilitator | n/a | 🟢 |
| 17 | Casper client / transactions / wallet libs | `src/lib/casper-client.js`, `casper-transactions.js`, `casper-wallet.js` | `casper-client.node-test.js` (client only) | Add tests for casper-transactions + casper-wallet (NONE today) | Exercise via claim flow on dev | CasperWalletButton connect | 🟡 transactions & wallet libs untested |

## 2. Identity, Profile & Media

| # | Feature | Code location(s) | Tests | Unit test | Agentic/API test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|------------------|---------|----------------|
| 18 | Metadata update (signed PUT, 5-min rounded ts) | `src/app/api/tiles/[id]/metadata/route.js`, `src/lib/verify-wallet-sig.js` | `verify-wallet-sig.node-test.js` (sig layer only) | Route-level test w/ mocked verify (NONE today) | Signed PUT via curl (skill has recipe); repeat with Casper `01…` key + Casper signature | EditTileForm / CustomizeTab | 🟡 `verifyCasperSignature` exists & unit-tested; route-level Casper path untested |
| 19 | Wallet signature verification (EVM EOA, ERC-1271 smart wallet, Casper ed25519/secp256k1) | `src/lib/verify-wallet-sig.js` | `verify-wallet-sig.node-test.js` | Existing; add ERC-1271 mock case | n/a | n/a | 🟢 `detectAddressChain` handles `0x…` vs `01/02…` |
| 20 | Tile ownership verification | `verify-wallet-sig.js` `verifyTileOwnership()` | NONE | Mock ownerOf + DB fallback both chains | Indirect via any authed route | n/a | 🔴 on-chain check EVM-only; Casper relies solely on DB (acceptable pre-launch but flag) |
| 21 | Tile token metadata JSON (OpenSea-compatible) | `src/app/api/tiles/[id]/route.js`, `metadata/route.js` (GET), `src/lib/openseaMetadata.js/.cjs` | `openseaMetadata.node-test.js`, `openseaMetadata.test.js`, `api-contract.node-test.js` | Existing | `GET /api/tiles/:id` for tiles on both chains | Tile detail page | 🟡 format is OpenSea/ERC-721 schema; check CEP-95 metadata expectations (attributes, `external_url`) and whether Casper tiles should point elsewhere |
| 22 | Image upload (multipart + base64, 512 master, 64/256/512 tiers, crop) | `src/app/api/tiles/[id]/image/route.js`, `src/lib/filebase.js` | NONE | Sharp pipeline test with fixture PNG; auth header test | POST both upload modes on dev; assert sizes | CustomizeTab upload | 🔴 auth fallback does EVM on-chain ownerOf for smart wallets — Casper wallet mismatch will 403; case-insensitive `toLowerCase()` compare OK for hex keys |
| 23 | Span image slicing (auto-slice across span) | `src/app/api/spans/[id]/image/route.js` | `multitileSpans.node-test.js` (span logic; check image path) | Slice math unit test | POST span image, GET each member tile image | MultiTileSpanModal | 🟡 same auth concern as #22 |
| 24 | Multi-tile spans CRUD | `src/app/api/spans/route.js`, `spans/[id]/route.js`, `src/lib/tileUtils.js` | `multitileSpans.node-test.js` | Existing (rect validation, ownership) | POST/GET/DELETE spans on dev | MultiTileSpanModal | 🟡 all-tiles-same-chain constraint? Mixed-chain span should be rejected — verify |
| 25 | Blocks (2×2 etc. block claims) | `src/app/api/blocks/route.js`, `blocks/[id]/route.js` | NONE | Block geometry + pricing test | POST /api/blocks on dev | BlockClaimModal | 🟡 chain param handling unverified |
| 26 | Social verification (GitHub / X proof) | `src/app/api/tiles/[id]/verification/route.js`, `tile-panel/VerifyGithubButton.js`, `VerifyXButton.js`, `VerificationBadge.js` | NONE | Mock gist/tweet fetch, assert proof parse | POST verification payloads on dev | Verify buttons in TilePanel | 🟡 proof message includes wallet — ensure Casper keys accepted |
| 27 | Tile views counter | `src/app/api/tiles/[id]/views/route.js` | NONE | Increment + dedupe test | POST/GET views | TilePanel view count | 🟢 chain-neutral |
| 28 | Featured tiles / spotlight | `src/app/api/featured/route.js`, `tiles/[id]/feature/route.js`, `FeaturedSpotlight.js` | NONE | Feature toggle auth test | GET /api/featured | Homepage spotlight | 🟢 chain-neutral (check address render in spotlight) |
| 29 | Tile search | `src/app/api/tiles/search/route.js` | NONE | Query matching test | `GET /api/tiles/search?q=` | Header search box | 🟡 searching by owner address — must match Casper keys too |
| 30 | Neighbors | `src/app/api/tiles/[id]/neighbors/route.js` | NONE | Adjacency math (edge/corner tiles) | GET neighbors of corner tile 0, 255, 65535 | NeighborNetworkPanel | 🟢 |

## 3. Presence & Reputation

| # | Feature | Code location(s) | Tests | Unit test | Agentic/API test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|------------------|---------|----------------|
| 31 | Heartbeat (5-min online window) | `src/app/api/tiles/[id]/heartbeat/route.js` | NONE | Wallet-match + timestamp write test | POST heartbeat, GET grid, assert status green | Grid pulse dot | 🟡 wallet compare must handle Casper keys; heartbeat inherits tile chain per design |
| 32 | Admin heartbeat sweep | `src/app/api/admin/heartbeat/route.js` | NONE | Token-auth + bulk expiry test | Admin curl on dev | n/a | 🟢 |
| 33 | Reputation score + breakdown | `src/app/api/tiles/[id]/rep/route.js`, `admin/rep-refresh/route.js` | NONE | Score formula test (heartbeat/connections/notes/actions/age/verified/profile) | GET /api/tiles/:id/rep | TilePanel rep display | 🟢 chain-neutral |
| 34 | Activity heat map scoring | `src/components/grid/utils.js` `getTileActivityScore()` | NONE | Pure-function test over fixture tiles | n/a | Heat-map toggle | 🟢 |

## 4. Social Interactions

| # | Feature | Code location(s) | Tests | Unit test | Agentic/API test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|------------------|---------|----------------|
| 35 | Notes / guestbook | `src/app/api/tiles/[id]/notes/route.js` | NONE | Validation + rate-limit test | POST/GET notes | InteractionsPanel | 🟡 author address display in UI — Casper truncation |
| 36 | IRC actions (slap/praise/…) per tile | `src/app/api/tiles/[id]/actions/route.js` | NONE | Action-type whitelist test | POST/GET actions | InteractionsPanel | 🟡 actor address rendering |
| 37 | Global actions feed | `src/app/api/actions/route.js` | NONE | Pagination test | GET /api/actions?limit= | ActivityFeed | 🟡 |
| 38 | Emote reactions (15 emoji) | `src/app/api/tiles/[id]/emotes/route.js` | NONE | Emoji whitelist + dedupe test | POST/GET emotes | InteractionsPanel | 🟢 |
| 39 | Encrypted DMs | `src/app/api/tiles/[id]/messages/route.js` | NONE | Auth (recipient wallet) + payload shape test | POST/GET messages | InteractionsPanel DM tab | 🔴 encryption keys derived from EVM wallets? Verify Casper key crypto path exists |
| 40 | Connections (connect + request lifecycle) | `src/app/api/tiles/[id]/connect/route.js`, `requests/route.js`, `requests/[requestId]/route.js`, `src/app/api/connections/route.js` | NONE | Request state-machine test (pending/accept/reject) | Full request lifecycle via curl | NeighborNetworkPanel | 🟡 signed with wallet — Casper path untested |
| 41 | Alliances (CRUD, join/leave, tile→alliance) | `src/app/api/alliances/route.js`, `alliances/[id]/route.js`, `join/`, `leave/`, `tiles/[id]/alliance/route.js` | NONE | Founder auth, membership invariants | Create/join/leave via curl | (alliance UI surface) | 🟡 founder wallet checks; cross-chain alliances allowed? define + test |
| 42 | Bounties (global + per-tile: create/submit/claim/award) | `src/app/api/bounties/route.js`, `tiles/[id]/bounties/**` | NONE | State machine test | Full bounty lifecycle via curl | `src/app/bounties/page.js` | 🟡 payout addresses cross-chain |
| 43 | Challenges (+ leaderboard) | `src/app/api/challenges/route.js`, `challenges/leaderboard/route.js`, `tiles/[id]/challenges/**` | NONE | Challenge scoring test | Lifecycle via curl | leaderboard page | 🟢 |
| 44 | Game: Capture the Flag | `src/app/api/games/capture-flag/**`, `tile-panel/CaptureTheFlagPanel.js` | NONE | Spawn/capture rules test | curl spawn + capture | CTF panel | 🟡 uses verifyWalletSignature — test Casper |
| 45 | Game: Pixel Wars (+ targets, leaderboard) | `src/app/api/games/pixel-wars/**` | NONE | Target/score rules test | curl endpoints | (grid overlay) | 🟢 |
| 46 | Game: Tower Defense (spawn/repel) | `src/app/api/games/tower-defense/**`, `TowerDefensePanel.js` | NONE | Spawn/repel rules test | curl endpoints | TD panel | 🟡 repel uses wallet sig |
| 47 | Notifications | `src/app/api/notifications/route.js` | NONE | Per-wallet fetch/ack test | GET/POST notifications | Header bell (if present) | 🟡 keyed by wallet — Casper keys |
| 48 | Activity feeds + SSE events | `src/app/api/activity/route.js`, `activities/route.js`, `events/route.js`, `src/lib/sse-broadcast.js` | NONE | Broadcast fan-out unit test | GET /api/events (SSE) + trigger action | ActivityFeed live updates | 🟡 activity rows show tx links/addresses — chain-correct rendering |

## 5. Discovery, Stats & Agentic Surface

| # | Feature | Code location(s) | Tests | Unit test | Agentic/API test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|------------------|---------|----------------|
| 49 | Grid API (full tile map + stats) | `src/app/api/grid/route.js` | `api-contract.node-test.js` | Shape test w/ seeded DB | GET /api/grid (assert `chain` per tile) | Grid render | 🟢 uses `getPerChainStats()` |
| 50 | Stats API (claimed/price/revenue, perChain, topHolders, recentlyClaimed) | `src/app/api/stats/route.js` | `api-contract.node-test.js` | Aggregation test | GET /api/stats | StatsPanel/Header | 🟡 `totalRevenue` mixes USDC + CSPR denominations? Revenue tracker slated for removal — verify perChain split before/after |
| 51 | Leaderboard API | `src/app/api/leaderboard/route.js` | NONE | Ranking test | GET /api/leaderboard | leaderboard page | 🟡 holder addresses render |
| 52 | Agents directory API | `src/app/api/agents/route.js` | NONE | Filter/pagination test | GET /api/agents | `src/app/agents/page.js` | 🟢 |
| 53 | Owner API (+ bulk-update) | `src/app/api/owner/[address]/route.js`, `bulk-update/route.js` | NONE | Address normalization test | GET /api/owner/{addr} with `0x…` AND `01…` key | owner/[address] page | 🔴 route param normalization: `toLowerCase()` on EVM vs mixed-case Casper key lookups; verify Casper owner pages resolve |
| 54 | Collection metadata (contract-level) | `src/app/api/collection/route.js` | `api-contract.node-test.js`, `openseaMetadata.*` | Existing | GET /api/collection | n/a | 🔴 single OpenSea-style collection — no Casper collection representation |
| 55 | Chains API (public chain registry) | `src/app/api/chains/route.js` | `chain-api.node-test.js` / `docs-multichain` (verify) | Shape test | GET /api/chains | n/a | 🟢 |
| 56 | SKILL.md agentic doc | `src/app/SKILL.md/route.js` | `docs-multichain.node-test.js` | Existing (multi-chain assertions) | curl /SKILL.md — assert both chains documented | n/a | 🟢 |
| 57 | llms.txt | `src/app/llms.txt/route.js` | `docs-multichain.node-test.js` | Existing | curl /llms.txt | n/a | 🟢 |
| 58 | openapi.json | `src/app/openapi.json/route.js`, `src/lib/route-registry.js` (86 routes) | `docs-multichain.node-test.js` | Registry↔filesystem parity test (audit script) | curl /openapi.json, validate schema incl. CasperPaymentRequirements | n/a | 🟢 watch $ref+sibling-description pitfall |
| 59 | A2A endpoint | `src/app/a2a/route.js` | NONE | JSON-RPC handshake test | POST A2A discovery/task messages | n/a | 🟡 uses per-chain functions (cold path OK); assert chain fields present |
| 60 | .well-known agent.json / ai-plugin.json | `src/app/.well-known/*/route.js` | NONE | Shape test | curl both | n/a | 🟢 |
| 61 | Widget embed + embed-code | `src/app/widget/[id]/page.js`, `widget/[id]/embed-code/route.js` | NONE | Embed HTML snapshot test | GET embed-code | iframe render | 🟡 uses `getSiteUrl` from openseaMetadata; check chain badge in widget |
| 62 | Route registry (source of truth for docs) | `src/lib/route-registry.js` | `docs-multichain.node-test.js` (indirect) | Parity test: every `route.js` present in registry | n/a | n/a | 🟢 |
| 63 | Rate limiter | `src/lib/rate-limiter.js` | NONE | Window/bucket unit test | Hammer an endpoint on dev, assert 429 | n/a | 🟢 |
| 64 | Webhooks | `src/lib/webhook.js` | NONE | Dispatch/retry test with mock server | Register webhook, trigger event | n/a | 🟢 |
| 65 | Structured logging / store / sound / features flags / onboarding lib | `src/lib/structured-logger.js`, `store.js`, `sound.js`, `features.js`, `onboarding.js` | `onboarding.node-test.js` (onboarding only) | Pure-function tests | n/a | n/a | 🟢 |
| 66 | Admin analytics | `src/app/api/admin/analytics/route.js`, `src/app/admin/analytics/page.js` | NONE | Auth + aggregation test | Admin curl | admin page | 🟡 revenue analytics likely single-denomination |

## 6. MCP Server (`packages/mcp`, npm `tiles-bot-mcp@0.3.0`)

28 tools in `packages/mcp/src/index.ts`. Test coverage: `packages/mcp/test/multichain.test.ts` covers chain-aware tools; most read/social tools have **no per-tool tests**.

| # | Tool(s) | Tests | How to test | Chain concerns |
|---|---------|-------|-------------|----------------|
| 67 | `tiles_get_stats`, `tiles_get_info`, `tiles_get_grid`, `tiles_get_neighbors`, `tiles_get_leaderboard`, `tiles_get_activity`, `tiles_get_owner_tiles` | NONE (read tools) | Mock fetch, assert URL + response mapping; live: `npx tiles-bot-mcp` against dev | 🟡 owner_tiles with Casper key |
| 68 | `get-supported-chains`, `get-chain-config` | `multichain.test.ts` | Existing | 🟢 |
| 69 | `tiles_claim`, `casper-claim-tile`, `tiles_batch_claim` | `multichain.test.ts` (partial) | Mock 402 responses per chain | 🟢 default chain=base — assert casper override |
| 70 | `tiles_check_owner`, `tiles_batch_register`, `tiles_register` | `multichain.test.ts` (parity tools) | Existing + extend register w/ deployHash | 🟡 |
| 71 | `tiles_update_metadata`, `tiles_upload_image`, `tiles_heartbeat` | NONE | Mock signed requests | 🟡 signing helper — EVM-only signer? verify Casper signing support or documented gap |
| 72 | `tiles_create_span`, `tiles_upload_span_image`, `tiles_get_spans` | NONE | Mock | 🟢 |
| 73 | `tiles_send_connection_request`, `tiles_respond_connection`, `tiles_get_pending_requests` | NONE | Mock | 🟡 |
| 74 | `tiles_leave_note`, `tiles_read_notes`, `tiles_action`, `tiles_emote`, `tiles_send_message`, `tiles_read_messages`, `tiles_get_actions` | NONE | Mock | 🟡 DM encryption for Casper |

## 7. Frontend Components & Pages

| # | Feature | Code location(s) | Tests | Unit test | UI test | Chain concerns |
|---|---------|------------------|-------|-----------|---------|----------------|
| 75 | Grid canvas (render, zoom/pan, chain border colors, heat map, selection) | `src/components/grid/Grid.js`, `SelectionOverlay.js`, `ToolToggle.js`, `MobileHints.js`, `grid/utils.js` | `chainVisuals.node-test.js` (visual helpers only) | Pure helpers (activity score, colors) | Playwright: `e2e/smoke.spec.ts` (extend: chain border assertions) | 🟢 blue=Base / red=Casper borders via chainVisuals |
| 76 | ListView (tabular tile browser) | `src/components/grid/ListView.js` | NONE | n/a | Playwright: sort/filter, address column | 🟡 address truncation via `formatAddressForChain` — verify used everywhere in list |
| 77 | TileTooltip (hover card) | `src/components/grid/TileTooltip.js` | NONE | n/a | Playwright hover | 🟡 chain badge + address format |
| 78 | Chain filter pills (FilterBar) | `src/components/FilterBar.js`, `chainVisuals.tileMatchesChainFilter` | `chainVisuals.node-test.js` | Existing filter fn tests | Playwright: `[aria-label="Chain filter"]` | 🟢 |
| 79 | Header (wallet connect, per-chain price `formatChainPrice`, search) | `src/components/Header.js`, `Providers.js`, `src/lib/wagmi.js` | NONE | Extract formatChainPrice to testable module | Playwright: connect flows, price display | 🟡 dual wallet UX → slated for single-chain login sessions; both wallets can be connected simultaneously today |
| 80 | Casper wallet button (CSPR.click) | `CasperWalletButton.js`, `CasperWalletButtonInner.js`, `src/lib/casper-wallet.js` | NONE | n/a | Playwright w/ CSPR.click test mode | 🟢 Casper-specific |
| 81 | StatsPanel (claimed/price/revenue) | `src/components/StatsPanel.js` | NONE | n/a | Playwright: perChain rows | 🟡 revenue tracker slated for removal; verify no `$`-formatting of CSPR values |
| 82 | LandingHero (marketing copy, how-it-works, OpenSea CTA) | `src/components/LandingHero.js` | `marketingCopy.node-test.js`, `onboarding.node-test.js` | Existing string assertions (update in lockstep w/ copy changes) | Playwright | 🔴 "View Collection on OpenSea" CTA is Base-only; narrative copy slated for removal — update tests together |
| 83 | ClaimModal (chain select → pay → mint → register) | `src/components/ClaimModal.js` | `chainSelectionUi.node-test.js` (source-string assertions) | Extend state-machine tests (see skill refs: back-button-during-tx bugs) | Playwright on dev, both chains | 🟢 chain-branched explorer link; 🔴 success step "View on OpenSea" link hardcodes `opensea.io/assets/base/${CONTRACT_ADDRESS}` — shown for Casper? verify gating |
| 84 | BatchClaimModal | `src/components/BatchClaimModal.js` | `chainSelectionUi.node-test.js` | Same as #83 | Playwright | 🔴 same OpenSea-first-tile link `opensea.io/assets/base/…` (line ~531); copy "Batch mint ERC-721 tiles with USDC" is Base-only in chain descriptions |
| 85 | BlockClaimModal | `src/components/BlockClaimModal.js` | NONE | n/a | Playwright | 🟡 chain selection parity with ClaimModal unverified |
| 86 | MultiTileSpanModal | `src/components/MultiTileSpanModal.js` | NONE | n/a | Playwright | 🟡 comment says per-tile API returns OpenSea metadata; owner lookups |
| 87 | OnboardingModal | `src/components/OnboardingModal.js` | NONE | n/a | Playwright first-visit | 🔴 copy: "Tiles start at $0.01 USDC… Trade on OpenSea" — no Casper mention |
| 88 | TilePanel + AboutTab (owner/contract/tx links, marketplace CTA) | `src/components/TilePanel.js`, `tile-panel/AboutTab.js`, `tile-panel/utils.js` | NONE | chainLinks builder unit test | Playwright: open Base tile vs Casper tile | 🟢 mostly chain-aware (cspr.live fallback, "no external marketplace" note, OS badge gated on base) — but fallback explorer hardcodes literals instead of chain registry |
| 89 | EditTileForm / CustomizeTab | `tile-panel/EditTileForm.js`, `CustomizeTab.js` | NONE | n/a | Playwright edit + save | 🟡 signing UX per chain |
| 90 | ShareButton / EmbedCodeButton | `tile-panel/ShareButton.js` | NONE | n/a | Playwright | 🟢 |
| 91 | Owner dashboard (OwnerTilesGrid, bulk rename) | `OwnerTilesGrid.js`, `OwnerDashboardBulkRename.js`, `BulkRenamePanel.js`, `src/app/owner/[address]/page.js` | NONE | n/a | Playwright with Casper-key URL | 🔴 page.js flagged in Base-hardcode grep; verify Casper address route param + display |
| 92 | ActivityFeed component | `src/components/ActivityFeed.js` | NONE | n/a | Playwright live feed | 🟡 tx link rendering per chain |
| 93 | Static pages: faq, activity, leaderboard, agents, network, bounties, tiles/[id] | `src/app/*/page.js` | NONE | n/a | Playwright smoke each | 🟡 faq mentions CEP-95 correctly; leaderboard/activity pages flagged for address/link rendering |
| 94 | Playwright smoke suite | `e2e/smoke.spec.ts`, `playwright.config.ts` | exists (1 spec) | n/a | Expand into full E2E campaign | — |

## SUSPECTED BASE-ONLY / CHAIN-BUG RISK

Ordered by severity. Each is a place where Casper tiles/wallets may render or behave incorrectly:

1. **`verify-wallet-sig.js:verifyTileOwnership()`** — on-chain check is explicitly EVM-only (`ownerOf(uint256)` via viem, `NEXT_PUBLIC_CONTRACT_ADDRESS`); Casper ownership relies entirely on DB. No CEP-95 `owner_of` query. Every authed route (metadata, image, connect, requests, feature, verification, batch-update, game repel/capture) inherits this.
2. **`src/app/api/tiles/[id]/image/route.js` smart-wallet fallback** — on mismatch it queries EVM `ownerOf`; a Casper wallet that isn't the exact DB owner string gets 403 with no Casper-side recovery.
3. **ClaimModal.js (~462) & BatchClaimModal.js (~531) success-step OpenSea links** — hardcode `opensea.io/assets/base/${CONTRACT_ADDRESS}/…`. Verify these are gated off for `selectedChain === 'casper'`; the explorer link above them IS gated, the OpenSea link appears not to be.
4. **BatchClaimModal chain description copy** — "Batch mint ERC-721 tiles with USDC. OpenSea support after claim." shown in chain selection; fine for the Base card, but confirm the Casper card has no ERC-721/USDC bleed-through.
5. **OnboardingModal.js (~36)** — "$0.01 USDC … Trade on OpenSea." No Casper/wCSPR mention; contradicts multi-chain positioning.
6. **LandingHero.js** — OpenSea collection CTA appears twice; only Base tiles exist there. (Narrative copy removal pass will touch this — update `marketingCopy.node-test.js` + `onboarding.node-test.js` in lockstep.)
7. **`/api/collection`** — single OpenSea-style contract-level collection metadata; no Casper collection concept. NFT marketplaces on Casper (cspr.market) have no equivalent feed.
8. **`/api/tiles/batch-register`** — verify it can parse a Casper `batch_claim` deploy (events/CES) and not just EVM logs. If EVM-only, Casper batch flow silently breaks.
9. **`/api/tiles/sync-chain`** — likely enumerates ERC-721 state only; no CEP-95 reconciliation.
10. **`owner/[address]` page + `/api/owner/[address]`** — flagged in hardcode grep; verify Casper public-key route params survive normalization (`toLowerCase()` on mixed-case hex keys is safe, but `0x` prefix assumptions / EVM checksum validation would reject `01…` keys).
11. **AboutTab.js:74 fallback explorer literals** — `chainId === 'casper' ? 'https://cspr.live' : 'https://basescan.org'` hardcoded instead of chain registry values; drift risk if explorer env vars change (e.g., testnet.cspr.live).
12. **ClaimModal/BatchClaimModal explorer helpers (lines ~45/92)** — hardcode `cspr.live` and `basescan.org` locally rather than using `chains.js` `explorerTx()`; testnet builds will link to mainnet explorers.
13. **DM encryption (`/api/tiles/[id]/messages`)** — if key derivation assumes EVM secp256k1 wallets, Casper ed25519 accounts can't participate. Needs audit.
14. **Stats `totalRevenue`** — potential USDC+CSPR summed in one number (different denominations). Revenue tracker is slated for removal — confirm perChain values are used everywhere else.
15. **MCP write tools (`tiles_update_metadata`, `tiles_upload_image`, `tiles_heartbeat`)** — verify signing/auth story for Casper keys; likely only documents EVM signing.
16. **Widget embed (`widget/[id]/embed-code`)** — pulls `getSiteUrl` from openseaMetadata lib; check chain badge/branding for Casper tiles in embeds.
17. **Tile token metadata (`/api/tiles/[id]`)** — OpenSea attribute schema served for both chains; confirm CEP-95 tooling accepts it or serve chain-appropriate variant.
18. **Header dual-wallet session** — both a Base and a Casper wallet can be connected at once today; the planned single-chain login session must define which wallet authorizes signed actions (batch-update, metadata) to avoid cross-chain signature confusion.
19. **Search by owner (`/api/tiles/search`)** — verify Casper public keys match (case-insensitivity, `01/02` prefixes).
20. **`casper-transactions.js` / `casper-wallet.js`** — zero test coverage on the two libs that build/sign Casper deploys; regressions here break the entire Casper claim UX undetected.

## Coverage Gap Summary (features with ZERO automated tests)

**API routes (24 feature areas):** batch-register, batch-update, sync-chain, check-owner (route-level), admin pending/retry-mints, image upload, blocks, verification, views, featured, search, neighbors, heartbeat, admin heartbeat, rep + rep-refresh, notes, per-tile & global actions, emotes, DMs, connections/requests, alliances, bounties, challenges, all 3 games, notifications, activity/activities/events(SSE), leaderboard, agents, owner API, a2a, .well-known docs, widget embed-code, admin analytics.

**Libs (8):** `casper-transactions.js`, `casper-wallet.js`, `rate-limiter.js`, `sse-broadcast.js`, `webhook.js`, `filebase.js`, `structured-logger.js`, `store.js` — plus `verifyTileOwnership()` inside verify-wallet-sig.

**MCP (20 of 28 tools):** all read tools, all social tools, metadata/image/heartbeat write tools, span tools (only chain tools + claim/register parity tools are tested).

**Frontend (essentially everything except source-string tests):** Grid, ListView, TileTooltip, Header, StatsPanel, TilePanel/AboutTab, EditTileForm, all modals except string-level checks on Claim/BatchClaim, owner dashboard, ActivityFeed, all pages. Only `e2e/smoke.spec.ts` (single Playwright spec) exercises the running UI.

**Well-covered (keep green):** chains.js (13+2 tests), chain-api, chainVisuals, bonding curves (2 suites), multichain schema, Casper x402 handler/e2e/client, claim route casper, docs (SKILL.md/llms.txt/openapi), verify-wallet-sig signatures, opensea metadata, spans logic, onboarding/marketing copy, MCP multichain, Solidity contract (hardhat), Casper contract (cargo).

### Headline counts

| Metric | Count |
|--------|-------|
| Total atomic features inventoried | **94** |
| Features with ZERO automated tests | **58** |
| Chain-risk flags (🔴 confirmed-suspect + 🟡 needs-verification) | **20 listed risks** (11 🔴 rows, 35 🟡 rows in matrix) |
