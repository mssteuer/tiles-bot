const MONITORED_EVENTS = new Set([
  'x402_payment_failed',
  'mint_failed',
  'chain_sync_error',
  'register_verification_failed',
]);

const DEFAULT_DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function safeJsonParse(line) {
  if (typeof line !== 'string' || !line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value) {
  const time = value ? new Date(value).getTime() : Date.now();
  return Number.isFinite(time) ? time : Date.now();
}

function fingerprintEvent(event) {
  const parts = [
    event.event || 'unknown_event',
    event.chain || '',
    event.context || '',
    event.tileId ?? '',
    event.wallet || '',
    event.txHash || '',
    event.errorCode || '',
    event.errorMessage || '',
  ];
  return parts.map((part) => String(part).toLowerCase()).join('|');
}

function parseStructuredLogLine(line) {
  const entry = safeJsonParse(line);
  if (!entry || !MONITORED_EVENTS.has(entry.event)) return null;
  return {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
    fingerprint: fingerprintEvent(entry),
  };
}

function analyzeStructuredLogs(lines, options = {}) {
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const seen = new Map();
  const events = [];
  const suppressed = [];
  const countsByEvent = {};

  for (const rawLine of lines || []) {
    const event = parseStructuredLogLine(rawLine);
    if (!event) continue;

    countsByEvent[event.event] = (countsByEvent[event.event] || 0) + 1;
    const occurredAt = normalizeTimestamp(event.timestamp);
    const lastSeenAt = seen.get(event.fingerprint);

    if (lastSeenAt != null && occurredAt - lastSeenAt < dedupeWindowMs) {
      suppressed.push({ event: event.event, fingerprint: event.fingerprint, timestamp: event.timestamp });
      continue;
    }

    seen.set(event.fingerprint, occurredAt);
    events.push({ ...event, occurredAt });
  }

  return {
    ok: events.length === 0,
    alertCount: events.length,
    suppressedCount: suppressed.length,
    countsByEvent,
    events,
    suppressed,
    dedupeWindowMs,
  };
}

function formatAlert(event) {
  const subject = event.event.replace(/_/g, ' ');
  const tile = event.tileId == null ? 'tile=?' : `tile=${event.tileId}`;
  const chain = event.chain ? ` chain=${event.chain}` : '';
  const code = event.errorCode ? ` code=${event.errorCode}` : '';
  const message = event.errorMessage || event.detail || 'unknown error';
  return `[tiles.bot] ${subject}: ${tile}${chain}${code} — ${message}`;
}

module.exports = {
  MONITORED_EVENTS,
  DEFAULT_DEDUPE_WINDOW_MS,
  parseStructuredLogLine,
  analyzeStructuredLogs,
  fingerprintEvent,
  formatAlert,
};
