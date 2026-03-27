# Task #463 — Bonding Curve ÷100 Design Spec

## Goal
Change the tile price range from $1–$11,111 to $0.01–$111 by dividing the bonding curve output by 100. All price display throughout the app must reflect the new range.

## Current Behavior
- `getCurrentPrice()` in `src/lib/db.js` returns exponential curve producing $1.00 for tile 1, $11,111 for tile 65,536
- Header shows "62/65,536 tiles at $1.01"
- ClaimModal shows "$1.00 USDC"

## Required Behavior
- Same exponential curve formula but ÷100 at output
- Formula: `Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES) / 100`
- Range: $0.01 (first tile) → $111 (last tile)
- Header: "62/65,536 tiles at $0.0101"
- ClaimModal: "$0.0101 USDC"
- LandingHero copy updated to "$0.01" and "$111"
- SKILL.md and llms.txt pricing updated

## Files to Change
- `src/lib/db.js` — `getCurrentPrice()` function only
- `src/components/LandingHero.js` — hero copy mentioning price
- `src/app/SKILL.md/route.js` — pricing in skill description
- `src/app/llms.txt/route.js` — pricing numbers

## Files NOT to Change
- Smart contract pricing (handled separately — contract has its own curve)
- x402 payment amount (derived from `getCurrentPrice()` so updates automatically)

## Acceptance Criteria
- [ ] `curl https://tiles.bot/api/stats` returns `currentPrice < 1` (e.g. `0.0101`)
- [ ] Header on https://tiles.bot shows price starting with `$0.0`
- [ ] ClaimModal shows `$0.0100 USDC` for an unclaimed tile when grid is near-empty
- [ ] No other behavior changes
- [ ] `npm run build` passes with zero errors

## Test
```bash
# After deploy:
curl https://tiles.bot/api/stats | jq .currentPrice
# Expected: 0.0101 (or similar < 1.00)
```
