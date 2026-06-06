# Casper Integration — Comprehensive Needs List

**Project:** tiles.bot (million-bot-homepage) multi-chain
**Status as of 2026-06-05:** Code ~90% complete. Blocked on credentials, on-chain deployment, and a facilitator-API conformance gap.
**Author:** Jean Clawd (COO) — grounded in repo source + live cspr.cloud mainnet docs, not vibes.

---

## TL;DR

The hard engineering is **done**: the Casper Odra NFT contract (32 tests passing, WASM built), the CSPR.click wallet integration, the `casper-x402.js` facilitator client, and the full multi-chain claim UX all exist in the repo. What stands between us and a working Casper claim flow on mainnet is three things:

1. **Credentials** — CSPR.click App ID + CSPR.cloud access token. Without these, the wallet modal won't open and the facilitator returns 401.
2. **On-chain deployment** — the TilesBot NFT contract and a wCSPR reference are **not deployed to mainnet**; env still reads `hash-unconfigured`. Needs a funded deploy wallet (~1,500 CSPR) and the resulting hashes wired in.
3. **Conformance gap** — `casper-x402.js` was written against an *assumed* facilitator spec. The now-live mainnet API differs in **auth header, request envelope, and response field names**. Even with a valid key, today's code would fail. This is real and provable (see §C).

Items 1 & 2 are what Michael flagged. Item 3 is the one that would have bitten us silently after we got the keys.

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

## C. Code Conformance Gaps — `casper-x402.js` vs LIVE mainnet facilitator

**This is the section that matters most.** `src/lib/casper-x402.js` was written against an early/assumed facilitator contract. The CSPR.cloud x402 facilitator is now live on mainnet, and its published API (docs.cspr.cloud/x402-facilitator-api) **does not match our client** in several places. Each of these would cause a failure *even after we have the API key*.

### C1. Auth header mismatch — **will 401**
- **Our code** (`fetchFacilitator`): sends `{ 'X-API-Key': apiKey }`.
- **Live docs** (`/supported` example): `-H 'authorization: 55f79117-…'` — a bare `Authorization` header with the access token.
- **Impact:** every verify/settle call returns 401. **Fix:** send `Authorization: <token>` instead of `X-API-Key`.

### C2. Request envelope mismatch — **wrong shape**
- **Our code:** POSTs `{ payment: <header string>, paymentRequirements }`.
- **Live docs** (`/verify`): expects `{ paymentPayload: <object>, paymentRequirements: <object> }`, where `paymentPayload` is a structured object (`x402Version`, `resource`, `accepted`, `payload{signature, publicKey, authorization}`) — **not** a raw header string, and the key is `paymentPayload`, not `payment`.
- **Impact:** facilitator rejects the body. **Fix:** decode the `X-PAYMENT` header into the `paymentPayload` object and send under the correct key.

### C3. Response field-name drift — **silent false negatives**
- **Our code:** reads `data.valid` (verify) and `data.settled` / `data.txHash` (settle).
- **Live docs:** verify returns `isValid` (+ `payer`, `invalidReason`, `invalidMessage`). Settle returns its own shape (`/settle` endpoint).
- **Impact:** we'd read `undefined` and treat every valid payment as invalid. **Fix:** map to `isValid` and the real settle response fields.

### C4. payTo format — account hash vs public key — **needs verification**
- **Our code / OpenAPI** (`route-registry.js`): `payTo` pattern `^(01|02)[0-9a-fA-F]{64}$` — i.e. a **public key**.
- **Live docs** (`/verify`): `payTo` = Casper **account hash**, format `00<64 hex chars>` in the verify schema; `/supported` `feePayer` is a bare 64-hex account hash.
- **Impact:** if the facilitator wants an account hash and we hand it a public key, settlement targets the wrong/invalid recipient. **Fix:** confirm whether `payTo` is account hash or public key, and derive accordingly.

### C5. x402 protocol version — **likely v1 → v2**
- **Live docs:** `x402Version` **must be `2`** in `paymentPayload`; `/supported` reports `x402Version: 2`.
- **Our code / tests:** PaymentRequirements builder doesn't emit `x402Version`; test mocks reference `x402Version: 1`.
- **Impact:** version negotiation failure. **Fix:** emit `x402Version: 2` and align tests.

### C6. CAIP-2 network string — **docs disagree with themselves; verify**
- **Our code:** `network: 'casper:casper'`.
- **Live docs:** `/supported` returns `casper:casper`, but the `/verify` example uses `casper:casper-net-1`. Their own docs are inconsistent.
- **Impact:** `network_mismatch` rejection if we pick the wrong one. **Fix:** call `GET /supported` against the live mainnet facilitator and use exactly what it returns.

> **Recommendation:** treat C1–C6 as a single focused task — "Reconcile casper-x402.js with the live mainnet facilitator spec" — gated on having the access token (A2) so we can hit `GET /supported` and a real `/verify` to validate against ground truth rather than docs.

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
2. Unit/integration tests updated to the v2 envelope (currently they mock the *old* shape, so they pass while reality fails — classic green-tests-red-prod trap).
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
- `casper-x402.js` facilitator client — exists, but needs the §C conformance fixes.
- Multi-chain claim UX — chain selector, Casper-native pricing (motes), claim instructions, register-by-deploy-hash flow.
- `chains.js` config layer + OpenAPI schemas + `llms.txt` agent docs for the Casper path.
- Full test suite for chain config, validation, API routes, docs.
