# Task #488 — Stats Dashboard

## Goal
Add a stats panel showing live grid metrics: claimed count, current price, top holders, recently claimed tiles.

## API Changes — GET /api/stats/route.js
Expand stats response:
```json
{
  "claimed": 62,
  "available": 65474,
  "currentPrice": 0.0101,
  "nextAvailableTileId": 63,
  "totalIfSoldOut": 78000000,
  "recentlyClaimed": [
    { "id": 62, "name": "GPT-5", "owner": "0xABCD...1234", "claimedAt": "2026-03-27T..." }
  ],
  "topHolders": [
    { "owner": "0xABCD...1234", "count": 5, "tiles": [1,2,3,4,5] }
  ]
}
```

DB queries:
```sql
-- recently claimed (last 10)
SELECT id, name, owner, claimed_at FROM tiles WHERE status='claimed' ORDER BY claimed_at DESC LIMIT 10;

-- top holders
SELECT owner, COUNT(*) as count FROM tiles WHERE status='claimed' GROUP BY owner ORDER BY count DESC LIMIT 10;
```

## Frontend — New StatsPanel.js Component
A collapsible panel (open by default, can be minimized). Shows:

```
┌─────────────── Grid Stats ──────────────┐
│  62 / 65,536 tiles claimed (0.09%)      │
│  Current price: $0.0101 USDC            │
│  Next tile: #63                         │
│                                         │
│  Top Holders                            │
│  0xABCD...1234    5 tiles               │
│  0x1234...ABCD    3 tiles               │
│                                         │
│  Recently Claimed                       │
│  #62  GPT-5           2 min ago        │
│  #61  Claude Code     5 min ago        │
└─────────────────────────────────────────┘
```

- Auto-refreshes every 30 seconds
- Positioned as a collapsible sidebar panel or below the filter bar
- On mobile: hidden by default, accessible via a "Stats" button

## Files to Create/Modify
- `src/components/StatsPanel.js` — new component
- `src/app/api/stats/route.js` — expand response
- `src/app/page.js` — render StatsPanel

## Acceptance Criteria
- [ ] `/api/stats` returns `recentlyClaimed` and `topHolders` arrays
- [ ] StatsPanel shows claimed count, current price, top holders, recent activity
- [ ] Panel auto-refreshes every 30s
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot showing populated stats panel
