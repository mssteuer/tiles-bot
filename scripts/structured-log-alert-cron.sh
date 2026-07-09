#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${TILES_BOT_REPO_DIR:-/home/jeanclaude/workspace/million-bot-homepage}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
SERVICE_NAME="${TILES_BOT_SYSTEMD_UNIT:-tiles-bot}"
SINCE_WINDOW="${STRUCTURED_LOG_ALERT_SINCE:-15 minutes ago}"
STATE_FILE="${STRUCTURED_LOG_ALERT_STATE_FILE:-/data/tiles-bot/structured-log-alert-state.json}"
DEDUPE_MS="${STRUCTURED_LOG_ALERT_DEDUPE_MS:-3600000}"

cd "$REPO_DIR"

journalctl --user -u "$SERVICE_NAME" --since "$SINCE_WINDOW" --no-pager -o cat \
  | "$NODE_BIN" scripts/monitor-structured-logs.js --json \
  | "$NODE_BIN" scripts/structured-log-alert-cron.js \
      --summary-json \
      --state-file "$STATE_FILE" \
      --cross-run-dedupe-ms "$DEDUPE_MS"
