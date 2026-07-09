const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildAlertMessage,
  filterNewAlerts,
  runStructuredLogAlertCheck,
} = require('../scripts/structured-log-alert-cron');

const ROOT = path.resolve(__dirname, '..');

function tempStatePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-structured-alert-')), 'state.json');
}

const failureLine = JSON.stringify({
  timestamp: '2026-07-09T10:00:00.000Z',
  level: 'error',
  event: 'x402_payment_failed',
  tileId: 32896,
  chain: 'base',
  wallet: '0xabc',
  errorCode: 'PAYMENT_INVALID',
  errorMessage: 'payment header rejected',
});

describe('structured log production alert cron helper', () => {
  it('suppresses delivery when the monitor summary is ok=true', async () => {
    const deliveries = [];
    const result = await runStructuredLogAlertCheck({
      input: 'plain stderr noise\n',
      stateFile: tempStatePath(),
      deliver: (message) => deliveries.push(message),
      now: new Date('2026-07-09T10:05:00.000Z'),
    });

    assert.equal(result.ok, true);
    assert.equal(result.delivered, false);
    assert.equal(deliveries.length, 0);
  });

  it('delivers only ok=false summaries through the provided alert channel', async () => {
    const deliveries = [];
    const result = await runStructuredLogAlertCheck({
      input: `${failureLine}\n`,
      stateFile: tempStatePath(),
      deliver: (message) => deliveries.push(message),
      now: new Date('2026-07-09T10:05:00.000Z'),
    });

    assert.equal(result.ok, false);
    assert.equal(result.delivered, true);
    assert.equal(result.alertCount, 1);
    assert.equal(deliveries.length, 1);
    assert.match(deliveries[0], /tiles\.bot structured-log alert/);
    assert.match(deliveries[0], /x402 payment failed/);
    assert.match(deliveries[0], /PAYMENT_INVALID/);
  });

  it('persists alert fingerprints to avoid duplicate spam across overlapping runs', async () => {
    const stateFile = tempStatePath();
    const firstDeliveries = [];
    const secondDeliveries = [];

    const first = await runStructuredLogAlertCheck({
      input: `${failureLine}\n`,
      stateFile,
      deliver: (message) => firstDeliveries.push(message),
      now: new Date('2026-07-09T10:05:00.000Z'),
      crossRunDedupeMs: 60 * 60 * 1000,
    });
    const second = await runStructuredLogAlertCheck({
      input: `${failureLine}\n`,
      stateFile,
      deliver: (message) => secondDeliveries.push(message),
      now: new Date('2026-07-09T10:10:00.000Z'),
      crossRunDedupeMs: 60 * 60 * 1000,
    });

    assert.equal(first.delivered, true);
    assert.equal(firstDeliveries.length, 1);
    assert.equal(second.ok, true);
    assert.equal(second.delivered, false);
    assert.equal(second.suppressedByStateCount, 1);
    assert.equal(secondDeliveries.length, 0);
  });

  it('does not mutate dedupe state during dry runs', async () => {
    const stateFile = tempStatePath();

    const result = await runStructuredLogAlertCheck({
      input: `${failureLine}\n`,
      stateFile,
      dryRun: true,
      now: new Date('2026-07-09T10:05:00.000Z'),
    });

    assert.equal(result.dryRun, true);
    assert.equal(fs.existsSync(stateFile), false);
  });

  it('expires persisted fingerprints after the cross-run dedupe window', async () => {
    const event = {
      event: 'mint_failed',
      fingerprint: 'mint_failed|base||7|0xabc|0xdead||receipt reverted',
      timestamp: '2026-07-09T12:00:00.000Z',
    };
    const filtered = filterNewAlerts([event], {
      state: { alerted: { [event.fingerprint]: '2026-07-09T10:00:00.000Z' } },
      now: new Date('2026-07-09T12:00:00.000Z'),
      crossRunDedupeMs: 60 * 60 * 1000,
    });

    assert.deepEqual(filtered.newEvents, [event]);
    assert.equal(filtered.suppressedByState.length, 0);
    assert.equal(filtered.nextState.alerted[event.fingerprint], '2026-07-09T12:00:00.000Z');
  });

  it('builds a compact operator summary without dumping raw JSON payloads', () => {
    const message = buildAlertMessage({
      alertCount: 1,
      suppressedCount: 0,
      suppressedByStateCount: 2,
      events: [{
        event: 'register_verification_failed',
        tileId: 7,
        chain: 'casper',
        errorCode: 'OWNER_MISMATCH',
        errorMessage: 'on-chain owner did not match wallet',
      }],
    });

    assert.match(message, /register verification failed/);
    assert.match(message, /state-suppressed duplicates: 2/);
    assert.doesNotMatch(message, /"event"/);
    assert.doesNotMatch(message, /fingerprint/);
  });

  it('ships a cron helper that pipes recent tiles-bot journal lines through monitor --json', () => {
    const helper = fs.readFileSync(path.join(ROOT, 'scripts/structured-log-alert-cron.sh'), 'utf8');

    assert.match(helper, /journalctl --user -u "\$SERVICE_NAME" --since "\$SINCE_WINDOW" --no-pager -o cat/);
    assert.match(helper, /scripts\/monitor-structured-logs\.js --json/);
    assert.match(helper, /scripts\/structured-log-alert-cron\.js/);
    assert.match(helper, /--summary-json/);
  });
});
