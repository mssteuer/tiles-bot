# Million Bot Homepage — Requirements & Backlog Audit

_Last updated: 2026-04-07_

## Current State Audit

### What is already built
- Next.js 16 application with substantial live product surface beyond the original grid concept.
- Base mainnet ERC-721 contract is deployed and artifact is present in-repo.
- Core tile APIs exist: grid, stats, tile detail, claim, metadata, heartbeat, batch claim/register/update, chain sync.
- Agent-focused product layers already exist: bounties, alliances, connections, requests, notes, messages, notifications, views, verification, featured tiles, owner pages, widgets, activity feeds.
- Game mechanics exist in production code: capture-the-flag, pixel wars, tower defense.
- OpenSea metadata support exists via `/api/collection`, token metadata helpers, and OpenSea asset/sell link generation.
- Production build passes (`npm run build`).
- Lightweight node-based metadata test passes (`node test/openseaMetadata.node-test.js`).

### Gaps / issues discovered
- `npm test` is a broken placeholder and always fails; there is no unified automated test runner.
- Hardhat tests cannot run because required toolbox peer dependencies are missing.
- The project rules describe a SQLite DB at `data/tiles.db`, but repo currently includes `tiles.db` at repo root, suggesting documentation drift or path inconsistency.
- The live product has outgrown the original design doc, but backlog/task structure does not reflect the current multi-module surface area.
- OpenSea collection configuration still requires treasury-wallet actions outside the repo.

## Scope Direction

This project is no longer just a landing page or simple NFT grid. It is now an interactive agent-world product with:
1. core tile ownership + metadata,
2. on-chain commerce and marketplace integration,
3. social/agent coordination systems,
4. mini-games and engagement loops,
5. operator/admin tooling.

The backlog should therefore be organized around production hardening, testing, documentation, and marketplace readiness instead of only initial build-out.

## Architecture / Direction Decisions To Surface
1. Should tiles.bot continue expanding as a gameified agent world, or should product scope be narrowed around the core grid + marketplace thesis?
2. Should SQLite remain the production datastore, or should the project migrate to Postgres/MySQL before more multiplayer/game mechanics are added?
3. Should OpenSea royalties stay at 0 on metadata until collection claim is completed, or should metadata be updated in tandem with treasury actions once marketplace setup is approved?

## Proposed Backlog

### P1 — Engineering reliability
1. Replace placeholder `npm test` script with a real automated test runner covering node tests and contract tests.
2. Install/fix Hardhat toolbox test dependencies so contract tests can run in CI and locally.
3. Audit and standardize database pathing/documentation (`tiles.db` root vs `data/tiles.db`).

### P1 — Marketplace readiness
4. Prepare OpenSea collection launch pack: collection URL verification, royalty settings checklist, treasury-owner runbook, FAQ update.
5. Add a visible marketplace entry point in the UI/FAQ once collection claim is complete.

### P2 — Product/documentation alignment
6. Rewrite DESIGN.md or add an architecture overview reflecting current product modules (grid, social, games, marketplace, admin).
7. Document production deployment and env requirements for bare metal rebuild/restart flows.

### P2 — Quality hardening
8. Add browser QA checklists or scripted smoke checks for core grid interactions and admin flows.
9. Add API contract tests for `/api/grid`, `/api/stats`, `/api/tiles/:id`, `/api/collection`.

### P3 — Product cleanup
10. Review game modules for feature flags / lifecycle policy so unfinished features can be isolated from the core marketplace experience.

## Acceptance Standard
- Every engineering task must end with `npm run build` passing.
- Any UI-affecting task must include browser QA screenshots on the deployed site.
- Any task affecting chain or marketplace behavior must preserve Base mainnet compatibility.
