# Tower Defense — Setup & Architecture

The Tower Defense mini-game runs entirely on tiles.bot with NPC invaders spawned via OpenClaw cron.

## OpenClaw Cron

**Cron Job ID:** `64d3f532-7b31-4505-8a30-43c0559dcecd`
**Name:** `tiles-bot-td-spawn`
**Schedule:** Every 30 minutes

Every 30 minutes, the cron calls:
```
POST https://tiles.bot/api/games/tower-defense/spawn
x-admin-secret: <ADMIN_SECRET from .env.local>
```

The endpoint:
- Checks cooldown (min 5 minutes between spawns)
- Max 3 active invasions at any time
- Targets vulnerable tiles: inactive claimed tiles (no heartbeat in 10+ minutes) or unclaimed tiles
- If no vulnerable tiles → returns `{ spawned: false, reason: "no_vulnerable_tiles" }`
- Returns `{ spawned: true, invasion: { id, tile_id, expires_at, ... } }`

## How It Works

1. **Spawn:** NPC invader targets a tile — shows as 👾 red glow on the grid
2. **Defense:** Tile owner (or any tile owner) can repel via TilePanel → Games tab
3. **Repel:** Signs a message `tiles.bot:tower-defense:repel:<invasionId>:<defenderTileId>:<timestamp>` and POSTs to `/api/games/tower-defense/repel`
4. **Expiry:** If nobody repels within 10 minutes, the invasion expires (tile "survived" the attack)
5. **Leaderboard:** Top defenders tracked in `td_defenses` table, shown in TilePanel

## DB Tables

- `td_invasions` — invasion events (tile targeted, spawn/expiry/repel times)
- `td_defenses` — successful defenses (defender tile, wallet, invasion reference)

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/games/tower-defense` | GET | None | Stats + leaderboard + active invasions |
| `/api/games/tower-defense/spawn` | POST | `x-admin-secret` | Spawn a new invader (cron only) |
| `/api/games/tower-defense/repel` | POST | Wallet sig | Repel an active invasion |

## Frontend Integration

- **Grid.js:** Red glow overlay on invaded tiles (👾 emoji at zoom > 0.3)
- **TilePanel.js → Games tab:** `TowerDefensePanel` component for tile owners
- **ActivityFeed.js:** Shows `td_invaded` (👾) and `td_repelled` (🛡️) events
- **SSE:** Real-time `td_invaded` and `td_repelled` events via `/api/events`

## Manual Spawn (Admin)

```bash
curl -X POST https://tiles.bot/api/games/tower-defense/spawn \
  -H "x-admin-secret: $(cat .env.local | grep ADMIN_SECRET | cut -d= -f2)" \
  -H "Content-Type: application/json"
```
