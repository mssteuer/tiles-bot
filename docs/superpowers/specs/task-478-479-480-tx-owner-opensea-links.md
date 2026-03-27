# Tasks #478, #479, #480 — Transaction Link, Owner Link, OpenSea List Button

These three are tightly coupled (all changes in TilePanel.js + DB schema) so implementing together.

## Task #478 — Transaction Hash Link

### DB Change
Add `tx_hash` TEXT column to tiles table:
```sql
ALTER TABLE tiles ADD COLUMN tx_hash TEXT;
```

### API Change — POST /api/tiles/[id]/claim/route.js
When a tile is claimed via x402 or wallet:
- Store the transaction hash in the DB: `UPDATE tiles SET tx_hash = ? WHERE id = ?`
- For x402 flow: the payment object contains `transaction.hash`
- For wallet flow (future): tx hash comes from the wallet tx response

### TilePanel.js — Display
On a claimed tile, show in the "Details" section:
```
Claimed: [date]
Tx: 0xabcd...1234  →  links to https://basescan.org/tx/{tx_hash}
```
- If `tx_hash` is null/empty: show "Tx: —" (graceful fallback for legacy tiles)
- Open link in new tab

---

## Task #479 — Owner Address Link

In TilePanel.js, the owner address display:
- Current: shows raw `0xABCD...` address
- New: truncated address is a link
- Primary link: `https://basescan.org/address/{owner}` (opens in new tab)
- Secondary link: small OpenSea icon/link to `https://opensea.io/{owner}` (their collection)

```jsx
<a href={`https://basescan.org/address/${tile.owner}`} target="_blank" rel="noopener">
  {truncate(tile.owner)}
</a>
<a href={`https://opensea.io/${tile.owner}`} target="_blank" rel="noopener" title="View on OpenSea">
  [OS icon]
</a>
```

---

## Task #480 — OpenSea List-for-Sale Button

When the connected wallet is the tile owner, show two action buttons in TilePanel:
1. **"View on OpenSea"** → `https://opensea.io/assets/base/{CONTRACT_ADDRESS}/{tokenId}` (already in #469, verify working)
2. **"List for Sale"** → `https://opensea.io/assets/base/{CONTRACT_ADDRESS}/{tokenId}?tab=sell` (direct to listing flow)
3. **"Share"** → copies `https://tiles.bot/?tile={tileId}` to clipboard, shows "Copied!" tooltip

The CONTRACT_ADDRESS comes from `process.env.NEXT_PUBLIC_CONTRACT_ADDRESS`.

---

## Shared Acceptance Criteria
- [ ] Claimed tile shows "Tx: [truncated hash]" linking to basescan (or "—" if none)
- [ ] Owner address is a clickable basescan link
- [ ] Owner address has secondary OpenSea profile link
- [ ] Owned tile shows "List for Sale" button linking to OpenSea sell flow
- [ ] "Share" button copies tile URL and shows confirmation
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot of tile panel showing all links/buttons

## Files to Change
- `src/app/api/tiles/[id]/claim/route.js` — store tx_hash
- `src/lib/db.js` — add tx_hash column migration
- `src/components/TilePanel.js` — add all link/button UI
