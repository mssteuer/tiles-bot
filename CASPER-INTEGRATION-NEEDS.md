# Casper Integration — Comprehensive Needs List

**Project:** tiles.bot (million-bot-homepage) multi-chain
**Status as of 2026-07-09:** Code conformance hardening is complete and covered by tests. Mainnet launch is still blocked on credentials, on-chain deployment, and live facilitator validation.
**Author:** Jean Clawd (COO) — grounded in repo source + live cspr.cloud mainnet docs, not vibes.

---

## TL;DR

The hard engineering is **done**: the Casper Odra NFT contract (32 tests passing, WASM built), the CSPR.click wallet integration, the live-spec-shaped `casper-x402.js` facilitator client, and the full multi-chain claim UX all exist in the repo. What stands between us and a working Casper claim flow on mainnet is now two external blockers plus one live-validation step:

1. **Credentials** — CSPR.click App ID + CSPR.cloud access token. Without these, the wallet modal won't open and the facilitator returns 401.
2. **On-chain deployment** — the TilesBot NFT contract and a wCSPR reference are **not deployed to mainnet**; env still reads `hash-unconfigured`. Needs a funded deploy wallet (~1,500 CSPR) and the resulting hashes wired in.
3. **Live facilitator validation** — the code now matches the published facilitator shape, but we still need a real token to call `GET /supported`, verify the exact network/payTo expectations, and run an end-to-end payment smoke.

Items 1 & 2 are what Michael flagged. Item 3 is the last “trust, but verify” step before Casper claims can go anywhere near production.

---

## A. Credentials & Accounts (external — needs Michael / account access)

| # | Need | Where to get it | Env var | Blocker level |
|---|------|-----------------|---------|---------------|
| A1 | **CSPR.click App ID** | Register the tiles.bot app at https://console.cspr.build | `NEXT_PUBLIC_CSPRCLICK_APP_ID` | **HARD** — sign-in modal won't open without it |
| A2 | **CSPR.cloud access token** (x402 facilitator auth) | cspr.cloud console → access tokens (paid tier may be required for mainnet quota) | `CASPER_FACILITATOR_API_KEY` | **HARD** — facilitator returns 401 without it |
| A3 | **Facilitator tier / quota confirmation** | Confirm the access tier covers expected claim volume + settlement rate limits | n/a | MEDIUM — silent throttling under load |

Notes:
- A1 is a free registration. A2 may sit behind a paid CSPR.cloud plan — worth confirming the tier when we request the token.
- The CSPR.click App ID is **public** (`NEXT_PUBLIC_` prefix, shipped to browser). The CSPR.cloud token is **secret** (server-side only) and must live in the systemd EnvironmentFile / `.env`, never in `NEXT_PUBLIC_`.

---

## B. On-Chain Deployment (Casper mainnet)

The Odra NFT contract is built and devnet-verified but **never deployed to a public chain**. Testnet was blocked on a browser-only faucet (see `contracts/casper/TESTNET-DEPLOYMENT.md`). For mainnet we skip the faucet — it's real CSPR.

| # | Need | Detail | Env var | Blocker |
|---|------|--------|---------|---------|
| B1 | **Funded mainnet deploy wallet** | ~1,500 CSPR covers wCSPR + NFT deploy + test mints (gas table in TESTNET-DEPLOYMENT.md). Generate a fresh mainnet key, do NOT reuse the testnet key `0196f3…fb7f`. | — | **HARD** |
| B2 | **Deploy TilesBot NFT contract to mainnet** | `cargo odra build` → deploy via Odra livenet backend against `node.cspr.cloud` / `node.mainnet.casper.network`. Yields the NFT package hash. | `CHAIN_CASPER_NFT_CONTRACT` | **HARD** — currently `hash-unconfigured` |
| B3 | **wCSPR payment token hash** | Use the canonical mainnet wCSPR CEP-18 **package hash** (don't deploy our own MockWcspr to mainnet — that's a test artifact). Confirm the official mainnet wCSPR package hash. | `CHAIN_CASPER_PAYMENT_TOKEN` | **HARD** — currently `hash-unconfigured` |
| B4 | **Treasury / payTo address** | The account that receives wCSPR payments. Currently the placeholder `0100…00`. Decide: deploy wallet, or a dedicated treasury key. **Format question — see §C4.** | `CHAIN_CASPER_TREASURY` | **HARD** |
| B5 | **Contract init params** | name=TilesBot, symbol=TILE, wcspr_address=B3, treasury=B4, icon=https://tiles.bot/icon.png, project=https://tiles.bot | (compile-time) | MEDIUM |
| B6 | **On-chain verification** | After deploy, verify on cspr.live and run a real mainnet test claim end-to-end before flipping `DEFAULT_CHAIN` exposure. | — | MEDIUM |

---

## C. Code Conformance Status — `casper-x402.js` vs LIVE mainnet facilitator

`src/lib/casper-x402.js` has been updated from the early assumed facilitator shape to the currently published CSPR.cloud x402 facilitator shape. The remaining uncertainty is live configuration data from `GET /supported`, because docs still disagree on a few Casper-specific values. Tiny spec goblin: the code now speaks the right dialect, but we still need the bouncer to confirm the accent.

### C1. Auth header — **fixed in code**
- `fetchFacilitator` sends `Authorization: <token>` and intentionally does **not** send `X-API-Key`.
- Covered by `test/casper-x402-handler.node-test.js`, which captures the facilitator request headers.

### C2. Request envelope — **fixed in code**
- `X-PAYMENT` is decoded from base64 JSON before facilitator calls.
- `/verify` and `/settle` send `{ paymentPayload, paymentRequirements }`, not `{ payment, paymentRequirements }`.
- Malformed payment headers are rejected before any facilitator network call.

### C3. Response field names — **fixed in code**
- Verify maps `isValid`, `invalidMessage`, and `invalidReason`.
- Settle maps `success`, `transaction`, `errorMessage`, and `errorReason`.
- Covered by success and failure-path handler tests.

### C4. payTo format — account hash vs public key — **still needs live verification**
- Current code uses `CHAIN_CASPER_TREASURY`, currently shaped as a Casper public key.
- Live docs mention Casper account-hash-shaped `payTo` in places and fee-payer account hashes elsewhere.
- Action: call `GET /supported` with the real token and confirm whether production `payTo` must be public key or account hash.

### C5. x402 protocol version — **fixed in code**
- `buildCasperPaymentRequirements()` emits `x402Version: 2`.
- Route and handler tests assert v2 in 402 responses, payment requirements, and payment payload fixtures.

### C6. CAIP-2 network string — **still needs live verification**
- Current code uses `network: 'casper:casper'` from `chains.js`.
- Published docs have shown both `casper:casper` and `casper:casper-net-1` examples.
- Action: call `GET /supported` against the live mainnet facilitator and use exactly what it returns.

> **Current recommendation:** do not create another broad “reconcile with docs” task. The remaining task is narrower: once A2 exists, run live `/supported` + verify/settle smoke, then adjust only `payTo` / `network` if the facilitator demands it.

---

## D. Config Wiring (internal — I can do once B & A land)

| # | Need | File |
|---|------|------|
| D1 | Replace `hash-unconfigured` NFT + payment token, real treasury | `~/.config/systemd/user/tiles-bot.service.d/env.conf` + `.env` |
| D2 | Add `NEXT_PUBLIC_CSPRCLICK_APP_ID`, confirm `NEXT_PUBLIC_CASPER_NETWORK=casper` | `.env` |
| D3 | Add `CASPER_FACILITATOR_API_KEY` (secret, server-side) | systemd EnvironmentFile / `.env` (NOT `.env.example`) |
| D4 | Confirm `CHAIN_CASPER_RPC_URL` — `node.cspr.cloud` vs `node.mainnet.casper.network` (the RPC for app reads, separate from the facilitator) | env.conf |
| D5 | Decide `DEFAULT_CHAIN` — keep `base` until Casper flow is mainnet-verified | env.conf |

---

## E. Testing & Verification (before we call it done)

1. `GET /supported` against live facilitator with the real token — capture exact `network`, `feePayer`, supported scheme.
2. Unit/integration tests updated to the v2 envelope and live-spec facilitator field names.
3. Real mainnet test claim: connect Casper Wallet → 402 challenge → sign → verify → settle → mint → register → tile appears on grid.
4. In-browser smoke test of both Base and Casper claim paths (per standing orders: no front-end ships unverified).
5. Preview on an `edicts.ai`/`clawfetch.ai` subdomain for Michael before any production exposure.

---

## F. Decisions Needed From Michael

1. **CSPR.cloud plan tier** — are we OK provisioning a paid tier if mainnet x402 requires it? (A2/A3)
2. **Treasury key** — deploy wallet as treasury, or a dedicated cold treasury key? (B4)
3. **wCSPR** — confirm we use the canonical mainnet wCSPR package hash (B3). I'll source the official one for sign-off.
4. **Launch sequencing** — soft-launch Casper claims behind a flag while Base stays default, or full cutover? (D5)

---

## Appendix: What's Already Done ✅

- Casper Odra NFT contract (`contracts/casper/`) — claim, batch_claim, bonding curve, admin, metadata. **32/32 tests pass**, WASM built (396 KB), devnet-verified.
- CSPR.click wallet integration (`src/lib/casper-wallet.js`, `CasperWalletButton*`) — SSR-safe, side-by-side with Base/wagmi.
- `casper-x402.js` facilitator client — live-spec-shaped auth header, request envelope, v2 requirements, and response mapping are implemented and tested.
- Multi-chain claim UX — chain selector, Casper-native pricing (motes), claim instructions, register-by-deploy-hash flow.
- `chains.js` config layer + OpenAPI schemas + `llms.txt` agent docs for the Casper path.
- Full test suite for chain config, validation, API routes, docs.
