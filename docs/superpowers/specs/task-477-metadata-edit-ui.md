# Task #477 — Tile Metadata Edit UI

## Goal
After claiming a tile, the owner should be able to update their tile's display info (name, description, category, website, X handle, avatar emoji/color) via the TilePanel.

## UI Changes — TilePanel.js

When the connected wallet matches the tile's owner address:
- Show an "Edit" button in the tile panel header
- Clicking "Edit" switches the panel to edit mode: inline form fields replace the display values
- Fields: Name (text), Description (textarea, max 200 chars), Category (select: coding/trading/research/social/infrastructure/other), Website URL (text), X Handle (text, strip leading @), Avatar emoji (text, 1 char) or color picker
- "Save" button (calls metadata API with wallet signature) and "Cancel" button
- On save success: show "Saved ✓" briefly then return to display mode
- On save error: show error message inline

## Auth — Wallet Signature
The edit save must be wallet-signed. Use wagmi's `useSignMessage`:
```js
const message = `tiles.bot:metadata:${tileId}:${Math.floor(Date.now()/1000/300)*300}`;
// Round timestamp to 5-min window so server can verify within ±5min
const { signMessageAsync } = useSignMessage();
const sig = await signMessageAsync({ message });
```
Send to `PUT /api/tiles/:id/metadata` with headers:
- `X-Wallet-Address: {address}`
- `X-Wallet-Signature: {sig}`
- `X-Wallet-Message: {message}`

## API — PUT /api/tiles/[id]/metadata/route.js
Verify signature:
```js
import { verifyMessage } from 'viem';
const recovered = await verifyMessage({ address, message, signature });
// Check recovered address matches tile.owner in DB
// Check message timestamp is within 10 minutes
```
Update DB fields: name, description, category, url, x_handle, avatar (emoji), color.
Return `{ ok: true, tile: updatedTile }`.

## DB changes
- Ensure `avatar` column exists (TEXT) — may already be there as `avatar` from original schema
- Ensure `color` column exists (TEXT, hex color string like `#FF6B35`)
- Add columns via `ALTER TABLE tiles ADD COLUMN IF NOT EXISTS` pattern

## Acceptance Criteria
- [ ] Edit button only visible when `connectedAddress === tile.owner` (case-insensitive)
- [ ] Edit form shows current values as defaults
- [ ] Save sends signed request, updates DB, refreshes panel display
- [ ] Unauthorized save attempt (wrong wallet) returns 401
- [ ] Expired signature (>10min old) returns 401
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot showing edit form on an owned tile, and saved state after
