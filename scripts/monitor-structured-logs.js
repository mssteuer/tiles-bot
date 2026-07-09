#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_DEDUPE_WINDOW_MS,
  analyzeStructuredLogs,
  formatAlert,
} = require('../src/lib/structured-log-monitor');

function printUsage() {
  process.stderr.write(`Usage: node scripts/monitor-structured-logs.js [--file <path>] [--dedupe-window-ms <ms>] [--json]\n\nReads tiles.bot structured stderr logs from a file or stdin and reports mint/x402/chain/register failures.\n`);
}

function parseArgs(argv) {
  const args = { file: null, json: false, dedupeWindowMs: DEFAULT_DEDUPE_WINDOW_MS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--file') {
      args.file = argv[++i];
    } else if (arg === '--dedupe-window-ms') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 0) throw new Error('--dedupe-window-ms must be a non-negative number');
      args.dedupeWindowMs = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readInput(file) {
  if (file) return fs.readFileSync(path.resolve(file), 'utf8');
  return fs.readFileSync(0, 'utf8');
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    printUsage();
    process.exit(2);
  }

  if (args.help) {
    printUsage();
    return;
  }

  const input = readInput(args.file);
  const lines = input.split(/\r?\n/);
  const result = analyzeStructuredLogs(lines, { dedupeWindowMs: args.dedupeWindowMs });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.ok) {
    process.stdout.write('tiles.bot structured-log monitor: no alertable mint/x402/chain/register failures found.\n');
    return;
  }

  for (const event of result.events) {
    process.stdout.write(`${formatAlert(event)}\n`);
  }
  if (result.suppressedCount > 0) {
    process.stdout.write(`suppressed duplicate failures: ${result.suppressedCount}\n`);
  }
}

if (require.main === module) main();
