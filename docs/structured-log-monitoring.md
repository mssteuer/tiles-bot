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

## Suggested production wiring

A safe first production loop is a read-only cron/timer:

```bash
journalctl --user -u tiles-bot --since '15 minutes ago' --no-pager -o cat \
  | /usr/bin/node /home/jeanclaude/workspace/million-bot-homepage/scripts/monitor-structured-logs.js --json
```

Route only `ok=false` summaries to Telegram/email. Do not include private keys or env dumps; the structured logger intentionally emits operational fields only.
