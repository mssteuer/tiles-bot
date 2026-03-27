# Task #476 — Default Claim to Next Available Tile

## Problem
"Claim a Tile" in the header opens ClaimModal defaulting to tile #0 (Row 0, Col 0). If tiles 0–N are already claimed, the user is trying to claim a taken tile.

## Required Behavior
When "Claim a Tile" is clicked in the header (no specific tile selected), default to the lowest unclaimed tile ID.

## Implementation

### API change — GET /api/stats
Add `nextAvailableTileId` to the response from `/api/stats/route.js`:
```js
const nextAvailable = db.prepare(
  'SELECT id FROM tiles WHERE status != ? ORDER BY id ASC LIMIT 1'
).get('claimed');
// if no unclaimed tiles found in DB, calculate from totalMinted
const nextAvailableId = nextAvailable?.id ?? totalMinted;
```
Stats response shape:
```json
{
  "claimed": 62,
  "available": 65474,
  "currentPrice": 0.0101,
  "nextAvailableTileId": 63
}
```

### Frontend — src/app/page.js
- On mount, fetch `/api/stats` and store `nextAvailableTileId` in state
- Pass as prop to Header: `<Header nextAvailableTileId={nextAvailableTileId} onClaimTile={openClaim} />`
- When header "Claim a Tile" is clicked: `openClaim(nextAvailableTileId)`

### src/components/Header.js
- Accept `nextAvailableTileId` prop (default to 0 if not loaded yet)
- On "Claim a Tile" click: call `onClaimTile(nextAvailableTileId)`

### src/components/ClaimModal.js
- Display tile position as: `Tile #${tileId} — Row ${Math.floor(tileId/256)}, Col ${tileId%256}`
- Show note: "Next available tile" when this is the auto-selected tile

## Acceptance Criteria
- [ ] `GET /api/stats` returns `nextAvailableTileId` field
- [ ] With 62 demo tiles claimed: clicking "Claim a Tile" opens modal for tile #63 (or whatever is next)
- [ ] If user clicks a specific unclaimed tile on grid, modal still opens for THAT tile (not next available)
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot of modal showing correct tile number (not #0)
