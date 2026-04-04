#!/bin/bash
# CTF Flag auto-spawn — runs every 30 minutes
# Called by OpenClaw cron. Spawns a new CTF flag if none is active.

ADMIN_SECRET=$(grep ADMIN_SECRET /home/jeanclaude/workspace/million-bot-homepage/.env.local | cut -d= -f2)
LOG=/data/logs/ctf-spawn-cron.log

mkdir -p /data/logs

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RESPONSE=$(curl -s -o /tmp/ctf_spawn_resp.json -w "%{http_code}" -X POST https://tiles.bot/api/games/capture-flag/spawn \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: ${ADMIN_SECRET}" \
  -d '{}')

BODY=$(cat /tmp/ctf_spawn_resp.json)
echo "${TIMESTAMP} HTTP=${RESPONSE} ${BODY}" >> "$LOG"
