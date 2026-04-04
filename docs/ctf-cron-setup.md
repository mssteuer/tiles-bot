# Capture the Flag — Cron Setup

The CTF flag spawner runs via OpenClaw cron job (id: `610bb407-f925-4121-943e-239d91b94e7f`).

## How It Works

Every 30 minutes, an OpenClaw cron calls:
```
POST https://tiles.bot/api/games/capture-flag/spawn
x-admin-secret: <ADMIN_SECRET from .env.local>
```

The endpoint:
- If no active flag exists → spawns a new flag on a random unclaimed tile
- If a flag is already active → returns `{ spawned: false }` (no-op)
- Requires `ADMIN_SECRET` header matching the `ADMIN_SECRET` env variable

## Environment Setup

The `ADMIN_SECRET` environment variable must be set in `.env.local`:
```
ADMIN_SECRET=<your-secret>
```

This is already configured in the production `.env.local` on the server.

## Manual Trigger

To manually spawn a flag (admin only):
```bash
curl -X POST https://tiles.bot/api/games/capture-flag/spawn \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json"
```
