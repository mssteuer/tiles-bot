#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { analyzeStructuredLogs, formatAlert } = require('../src/lib/structured-log-monitor');

const DEFAULT_STATE_FILE = '/data/tiles-bot/structured-log-alert-state.json';
const DEFAULT_CROSS_RUN_DEDUPE_MS = 60 * 60 * 1000;
const DEFAULT_TELEGRAM_CHAT_ID = '8756311637';

function parseArgs(argv) {
  const args = {
    file: null,
    summaryJson: false,
    stateFile: process.env.STRUCTURED_LOG_ALERT_STATE_FILE || DEFAULT_STATE_FILE,
    crossRunDedupeMs: Number(process.env.STRUCTURED_LOG_ALERT_DEDUPE_MS || DEFAULT_CROSS_RUN_DEDUPE_MS),
    dryRun: false,
    json: false,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID,
    telegramThreadId: process.env.TELEGRAM_THREAD_ID || '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') args.file = argv[++i];
    else if (arg === '--summary-json') args.summaryJson = true;
    else if (arg === '--state-file') args.stateFile = argv[++i];
    else if (arg === '--cross-run-dedupe-ms') args.crossRunDedupeMs = Number(argv[++i]);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--telegram-chat-id') args.telegramChatId = argv[++i];
    else if (arg === '--telegram-thread-id') args.telegramThreadId = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.crossRunDedupeMs) || args.crossRunDedupeMs < 0) {
    throw new Error('--cross-run-dedupe-ms must be a non-negative number');
  }
  return args;
}

function usage() {
  return [
    'Usage: node scripts/structured-log-alert-cron.js [--summary-json] [--file <path>] [--state-file <path>] [--dry-run] [--json]',
    '',
    'Reads a monitor JSON summary from stdin when --summary-json is set; otherwise reads raw structured log lines and analyzes them directly.',
    'Only ok=false summaries with non-duplicate events are delivered to the internal Telegram alert channel.',
  ].join('\n');
}

function readInput(file) {
  if (file) return fs.readFileSync(path.resolve(file), 'utf8');
  return fs.readFileSync(0, 'utf8');
}

function readState(stateFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.alerted ? parsed : { alerted: {} };
  } catch (err) {
    if (err.code === 'ENOENT') return { alerted: {} };
    throw err;
  }
}

function writeState(stateFile, state) {
  const dir = path.dirname(stateFile);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(stateFile)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, stateFile);
}

function parseTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function eventTimestamp(event, now) {
  const time = parseTime(event.timestamp);
  return time ? new Date(time).toISOString() : now.toISOString();
}

function pruneState(state, now, crossRunDedupeMs) {
  const cutoff = now.getTime() - crossRunDedupeMs;
  const alerted = {};
  for (const [fingerprint, timestamp] of Object.entries(state.alerted || {})) {
    const seenAt = parseTime(timestamp);
    if (seenAt >= cutoff) alerted[fingerprint] = timestamp;
  }
  return { alerted };
}

function filterNewAlerts(events, options = {}) {
  const now = options.now || new Date();
  const crossRunDedupeMs = options.crossRunDedupeMs ?? DEFAULT_CROSS_RUN_DEDUPE_MS;
  const nextState = pruneState(options.state || { alerted: {} }, now, crossRunDedupeMs);
  const newEvents = [];
  const suppressedByState = [];

  for (const event of events || []) {
    const fingerprint = event.fingerprint || [event.event, event.chain || '', event.tileId ?? '', event.errorCode || '', event.errorMessage || ''].join('|').toLowerCase();
    if (nextState.alerted[fingerprint]) {
      suppressedByState.push({ event: event.event, fingerprint, timestamp: event.timestamp });
      continue;
    }
    nextState.alerted[fingerprint] = eventTimestamp(event, now);
    newEvents.push({ ...event, fingerprint });
  }

  return { newEvents, suppressedByState, nextState };
}

function buildAlertMessage(summary) {
  const lines = [
    '🚨 tiles.bot structured-log alert',
    `alertable failures: ${summary.events.length}`,
  ];
  if (summary.suppressedCount) lines.push(`window-suppressed duplicates: ${summary.suppressedCount}`);
  if (summary.suppressedByStateCount) lines.push(`state-suppressed duplicates: ${summary.suppressedByStateCount}`);
  lines.push('');
  for (const event of summary.events.slice(0, 10)) lines.push(formatAlert(event));
  if (summary.events.length > 10) lines.push(`…and ${summary.events.length - 10} more`);
  return lines.join('\n');
}

function resolveTelegramToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  try {
    return execFileSync('python3', [path.join(os.homedir(), '.hermes/scripts/lib/resolve_secret.py'), 'telegram-bot-token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function deliverTelegram(message, options = {}) {
  const token = options.token || resolveTelegramToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set and telegram-bot-token could not be resolved');
  const body = {
    chat_id: options.chatId || DEFAULT_TELEGRAM_CHAT_ID,
    text: message,
    disable_web_page_preview: true,
  };
  if (options.threadId) body.message_thread_id = Number(options.threadId);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: HTTP ${response.status} ${await response.text()}`);
}

function summaryFromInput(input, options = {}) {
  if (options.summaryJson) return JSON.parse(input || '{}');
  return analyzeStructuredLogs((input || '').split(/\r?\n/), options);
}

async function runStructuredLogAlertCheck(options = {}) {
  const now = options.now || new Date();
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const state = options.state || readState(stateFile);
  const monitorSummary = options.summary || summaryFromInput(options.input || '', { summaryJson: options.summaryJson });

  if (monitorSummary.ok || !monitorSummary.events?.length) {
    return { ...monitorSummary, ok: true, delivered: false, suppressedByStateCount: 0 };
  }

  const filtered = filterNewAlerts(monitorSummary.events, {
    state,
    now,
    crossRunDedupeMs: options.crossRunDedupeMs ?? DEFAULT_CROSS_RUN_DEDUPE_MS,
  });
  const alertSummary = {
    ...monitorSummary,
    ok: filtered.newEvents.length === 0,
    alertCount: filtered.newEvents.length,
    events: filtered.newEvents,
    suppressedByState: filtered.suppressedByState,
    suppressedByStateCount: filtered.suppressedByState.length,
  };

  if (alertSummary.ok) {
    writeState(stateFile, filtered.nextState);
    return { ...alertSummary, delivered: false };
  }

  const message = buildAlertMessage(alertSummary);
  if (options.dryRun) {
    return { ...alertSummary, delivered: false, dryRun: true, message };
  }

  const deliver = options.deliver || ((text) => deliverTelegram(text, {
    chatId: options.telegramChatId,
    threadId: options.telegramThreadId,
    token: options.telegramToken,
  }));
  await deliver(message);
  writeState(stateFile, filtered.nextState);
  return { ...alertSummary, delivered: true, message };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n${usage()}\n`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  try {
    const result = await runStructuredLogAlertCheck({
      input: readInput(args.file),
      summaryJson: args.summaryJson,
      stateFile: args.stateFile,
      crossRunDedupeMs: args.crossRunDedupeMs,
      dryRun: args.dryRun,
      telegramChatId: args.telegramChatId,
      telegramThreadId: args.telegramThreadId,
    });
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else if (result.dryRun && result.message) process.stdout.write(`${result.message}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_STATE_FILE,
  DEFAULT_CROSS_RUN_DEDUPE_MS,
  buildAlertMessage,
  filterNewAlerts,
  runStructuredLogAlertCheck,
  deliverTelegram,
};
