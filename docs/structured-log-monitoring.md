# tiles.bot Structured Log Monitoring

`src/lib/structured-logger.js` emits JSON error lines to stderr for the operational paths that matter most:

- `x402_payment_failed`
- `mint_failed`
- `chain_sync_error`
- `register_verification_failed`

`src/lib/structured-log-monitor.js` and `scripts/monitor-structured-logs.js` turn those raw stderr lines into deduped operator alerts.

## Local smoke

```bash
printf '%s\n' '{"timestamp":"2026-07-09T10:00:00Z","level":"error","event":"x402_payment_failed","tileId":32896,"wallet":"0xabc","errorCode":"PAYMENT_INVALID","errorMessage":"payment header rejected"}' \
  | node scripts/monitor-structured-logs.js
```

Expected output:

```text
[tiles.bot] x402 payment failed: tile=32896 code=PAYMENT_INVALID — payment header rejected
```

## JSON mode for cron or systemd timers

```bash
journalctl --user -u tiles-bot --since '15 minutes ago' --no-pager -o cat \
  | node scripts/monitor-structured-logs.js --json
```

The JSON output includes:

- `ok`: true when no alertable failures were found
- `alertCount`: deduped alert count
- `suppressedCount`: duplicate failures suppressed inside the dedupe window
- `countsByEvent`: raw monitored-event counts before suppression
- `events`: alertable event details with fingerprints

## Dedupe / rate-limit behavior

Identical failures are fingerprinted by event type, chain, context, tile, wallet, tx hash, error code, and message.

By default, repeated identical failures inside 15 minutes are suppressed.

Override for a cron window:

```bash
node scripts/monitor-structured-logs.js --dedupe-window-ms 3600000 --json
```

## Production alert delivery

Use the committed helper so production runs the same pipeline every time:

```bash
/home/jeanclaude/workspace/million-bot-homepage/scripts/structured-log-alert-cron.sh
```

The helper is read-only against application logs and performs this pipeline:

```bash
journalctl --user -u tiles-bot --since '15 minutes ago' --no-pager -o cat \
  | /usr/bin/node scripts/monitor-structured-logs.js --json \
  | /usr/bin/node scripts/structured-log-alert-cron.js --summary-json
```

`structured-log-alert-cron.js` sends only `ok=false` summaries to the existing internal Telegram alert channel. `ok=true` monitor output is silent. It persists alert fingerprints in `/data/tiles-bot/structured-log-alert-state.json` so overlapping cron/timer windows do not spam Michael with the same failure every run.

Safe dry-run with a fixture or pasted journal output:

```bash
printf '%s\n' '{"timestamp":"2026-07-09T10:00:00Z","level":"error","event":"x402_payment_failed","tileId":32896,"wallet":"0xabc","errorCode":"PAYMENT_INVALID","errorMessage":"payment header rejected"}' \
  | node scripts/monitor-structured-logs.js --json \
  | node scripts/structured-log-alert-cron.js --summary-json --dry-run --json --state-file /tmp/tiles-bot-structured-log-alert-state.json
```

### Cron example

```cron
*/5 * * * * STRUCTURED_LOG_ALERT_SINCE='15 minutes ago' /home/jeanclaude/workspace/million-bot-homepage/scripts/structured-log-alert-cron.sh >> /data/logs/tiles-bot-structured-log-alert.log 2>&1
```

### systemd user timer example

`~/.config/systemd/user/tiles-bot-structured-log-alert.service`:

```ini
[Unit]
Description=tiles.bot structured log alert delivery

[Service]
Type=oneshot
Environment=STRUCTURED_LOG_ALERT_SINCE=15 minutes ago
ExecStart=/home/jeanclaude/workspace/million-bot-homepage/scripts/structured-log-alert-cron.sh
```

`~/.config/systemd/user/tiles-bot-structured-log-alert.timer`:

```ini
[Unit]
Description=Run tiles.bot structured log alert delivery every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=tiles-bot-structured-log-alert.service

[Install]
WantedBy=timers.target
```

Enable with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now tiles-bot-structured-log-alert.timer
```

Environment knobs:

- `STRUCTURED_LOG_ALERT_SINCE` — journal window, default `15 minutes ago`
- `STRUCTURED_LOG_ALERT_STATE_FILE` — cross-run dedupe state, default `/data/tiles-bot/structured-log-alert-state.json`
- `STRUCTURED_LOG_ALERT_DEDUPE_MS` — cross-run duplicate window, default `3600000`
- `TILES_BOT_SYSTEMD_UNIT` — source service, default `tiles-bot`
- `TELEGRAM_CHAT_ID` / `TELEGRAM_THREAD_ID` — override the internal alert destination when needed

Do not include private keys or env dumps in alerts; the structured logger intentionally emits operational fields only.
