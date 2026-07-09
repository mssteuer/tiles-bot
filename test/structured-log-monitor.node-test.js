const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  MONITORED_EVENTS,
  parseStructuredLogLine,
  analyzeStructuredLogs,
  formatAlert,
} = require('../src/lib/structured-log-monitor');

describe('structured-log monitor', () => {
  it('recognizes every operational failure event emitted by structured-logger', () => {
    assert.deepEqual([...MONITORED_EVENTS].sort(), [
      'chain_sync_error',
      'mint_failed',
      'register_verification_failed',
      'x402_payment_failed',
    ]);

    const parsed = parseStructuredLogLine(JSON.stringify({
      timestamp: '2026-07-09T10:00:00.000Z',
      level: 'error',
      event: 'x402_payment_failed',
      tileId: 32896,
      wallet: '0xabc',
      errorCode: 'PAYMENT_INVALID',
      errorMessage: 'payment header rejected',
    }));

    assert.equal(parsed.event, 'x402_payment_failed');
    assert.equal(parsed.tileId, 32896);
    assert.match(parsed.fingerprint, /payment_invalid/);
    assert.equal(parseStructuredLogLine('not json'), null);
    assert.equal(parseStructuredLogLine(JSON.stringify({ event: 'heartbeat' })), null);
  });

  it('dedupes identical failures inside the configured rate-limit window', () => {
    const duplicate = {
      level: 'error',
      event: 'mint_failed',
      tileId: 42,
      wallet: '0xabc',
      txHash: '0xdead',
      errorMessage: 'receipt reverted',
    };
    const lines = [
      JSON.stringify({ ...duplicate, timestamp: '2026-07-09T10:00:00.000Z' }),
      JSON.stringify({ ...duplicate, timestamp: '2026-07-09T10:05:00.000Z' }),
      JSON.stringify({ ...duplicate, timestamp: '2026-07-09T10:20:00.000Z' }),
      JSON.stringify({ ...duplicate, timestamp: '2026-07-09T10:21:00.000Z', tileId: 43 }),
    ];

    const result = analyzeStructuredLogs(lines, { dedupeWindowMs: 15 * 60 * 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.alertCount, 3);
    assert.equal(result.suppressedCount, 1);
    assert.equal(result.countsByEvent.mint_failed, 4);
    assert.deepEqual(result.events.map((event) => event.tileId), [42, 42, 43]);
  });

  it('formats operator-safe alert lines without dumping full JSON payloads', () => {
    const event = parseStructuredLogLine(JSON.stringify({
      timestamp: '2026-07-09T10:00:00.000Z',
      level: 'error',
      event: 'register_verification_failed',
      tileId: 7,
      wallet: '0xabc',
      errorCode: 'OWNER_MISMATCH',
      errorMessage: 'on-chain owner did not match wallet',
    }));

    const alert = formatAlert(event);
    assert.match(alert, /register verification failed/);
    assert.match(alert, /tile=7/);
    assert.match(alert, /OWNER_MISMATCH/);
    assert.doesNotMatch(alert, /timestamp/);
  });

  it('CLI reads stdin and emits JSON summaries for cron integration', () => {
    const input = [
      JSON.stringify({
        timestamp: '2026-07-09T10:00:00.000Z',
        level: 'error',
        event: 'chain_sync_error',
        context: 'sync-chain',
        errorMessage: 'rpc timeout',
      }),
      'plain stderr noise',
    ].join('\n');

    const output = execFileSync(process.execPath, ['scripts/monitor-structured-logs.js', '--json'], {
      cwd: ROOT,
      input,
      encoding: 'utf8',
    });
    const summary = JSON.parse(output);
    assert.equal(summary.alertCount, 1);
    assert.equal(summary.events[0].event, 'chain_sync_error');
  });
});
