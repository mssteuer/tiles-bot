/**
 * SQLite WAL write concurrency benchmark for tiles.bot
 * Tests concurrent inserts into the most active tables under social/game load.
 * Usage: node scripts/sqlite-load-bench.mjs
 */

import Database from 'better-sqlite3';
import { copyFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SOURCE_DB = join(REPO_ROOT, 'data', 'tiles.db');
const BENCH_DB = join(REPO_ROOT, 'data', 'tiles-bench.db');

const CONCURRENCY_LEVELS = [10, 50, 100];
const WRITES_PER_WORKER = 20;

// Operations keyed to actual schema
const WRITE_OPERATIONS = [
  {
    name: 'tile_messages',
    sql: `INSERT INTO tile_messages (from_tile, to_tile, sender, encrypted_body, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    args: (i) => [((i % 1000) + 1), ((i % 1000) + 2), `bench${i}`, `encrypted_${i}`],
  },
  {
    name: 'tile_emotes',
    sql: `INSERT INTO tile_emotes (from_tile, to_tile, emoji, actor, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    args: (i) => [((i % 1000) + 1), ((i % 1000) + 2), '🤖', `0xbench${i.toString(16).padStart(10,'0')}`],
  },
  {
    name: 'events_log',
    sql: `INSERT INTO events_log (type, tile_id, actor, metadata, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    args: (i) => ['bench_event', ((i % 1000) + 1), `0xbench${i.toString(16).padStart(10,'0')}`, JSON.stringify({bench: true, seq: i})],
  },
];

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(latencies) {
  const valid = latencies.filter(l => l >= 0);
  const sorted = [...valid].sort((a, b) => a - b);
  return {
    p50: sorted.length ? percentile(sorted, 50).toFixed(2) : 'N/A',
    p95: sorted.length ? percentile(sorted, 95).toFixed(2) : 'N/A',
    p99: sorted.length ? percentile(sorted, 99).toFixed(2) : 'N/A',
    errors: latencies.filter(l => l < 0).length,
    total: latencies.length,
  };
}

async function runWorker(dbPath, workerId, writesPerWorker) {
  return new Promise((resolve) => {
    const w = new Worker(fileURLToPath(import.meta.url), {
      workerData: { dbPath, workerId, writesPerWorker, isWorker: true },
    });
    w.on('message', resolve);
    w.on('error', (e) => resolve({ latencies: [], error: e.message }));
    w.on('exit', (code) => { if (code !== 0) resolve({ latencies: [] }); });
  });
}

if (!isMainThread && workerData?.isWorker) {
  const { dbPath, workerId, writesPerWorker } = workerData;
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  const latencies = [];

  for (let i = 0; i < writesPerWorker; i++) {
    const op = WRITE_OPERATIONS[i % WRITE_OPERATIONS.length];
    const args = op.args(workerId * writesPerWorker + i);
    const t0 = performance.now();
    try {
      db.prepare(op.sql).run(...args);
      latencies.push(performance.now() - t0);
    } catch {
      latencies.push(-1);
    }
  }
  db.close();
  parentPort.postMessage({ latencies });
  process.exit(0);
}

// Main thread — copy source DB to bench DB
copyFileSync(SOURCE_DB, BENCH_DB);
for (const ext of ['', '-wal', '-shm']) {
  if (existsSync(BENCH_DB + ext) && ext) try { unlinkSync(BENCH_DB + ext); } catch {}
}

// WAL mode on bench DB
{
  const setup = new Database(BENCH_DB);
  setup.pragma('journal_mode = WAL');
  setup.close();
}

console.log('SQLite WAL Write Concurrency Benchmark — tiles.bot');
console.log('===================================================');
console.log(`DB: ${BENCH_DB}`);
console.log(`Writes per worker: ${WRITES_PER_WORKER}`);
console.log('');

const results = [];

for (const concurrency of CONCURRENCY_LEVELS) {
  process.stdout.write(`Running ${concurrency} concurrent writers... `);
  const workers = Array.from({ length: concurrency }, (_, i) =>
    runWorker(BENCH_DB, i, WRITES_PER_WORKER)
  );
  const t0 = performance.now();
  const workerResults = await Promise.all(workers);
  const elapsed = performance.now() - t0;

  const allLatencies = workerResults.flatMap(r => r.latencies || []);
  const s = stats(allLatencies);
  const throughput = ((allLatencies.length - s.errors) / (elapsed / 1000)).toFixed(1);
  const errorRate = allLatencies.length ? ((s.errors / allLatencies.length) * 100).toFixed(1) : '0.0';

  console.log(`done (${elapsed.toFixed(0)}ms wall)`);
  console.log(`  Total writes: ${allLatencies.length}, Errors: ${s.errors} (${errorRate}%)`);
  console.log(`  Throughput: ${throughput} writes/sec`);
  console.log(`  Latency — p50: ${s.p50}ms  p95: ${s.p95}ms  p99: ${s.p99}ms`);
  console.log('');

  results.push({
    concurrency,
    total: allLatencies.length,
    errors: s.errors,
    error_rate_pct: parseFloat(errorRate),
    throughput_per_sec: parseFloat(throughput),
    p50_ms: parseFloat(s.p50) || 0,
    p95_ms: parseFloat(s.p95) || 0,
    p99_ms: parseFloat(s.p99) || 0,
    elapsed_ms: parseInt(elapsed.toFixed(0)),
  });
}

// Cleanup bench DB
for (const ext of ['', '-wal', '-shm']) {
  try { unlinkSync(BENCH_DB + ext); } catch {}
}

const highLoad = results.find(r => r.concurrency === 100);
const needsMigration = (highLoad?.p95_ms > 100) || (highLoad?.error_rate_pct > 1.0);

console.log('=== RECOMMENDATION ===');
if (needsMigration) {
  console.log('⚠️  POSTGRES MIGRATION RECOMMENDED');
  console.log('   p95 > 100ms or error rate > 1% at 100 concurrent writers');
} else {
  console.log('✅  SQLite WAL SUFFICIENT');
  console.log('   p95 < 100ms and error rate < 1% at all tested concurrency levels');
}

console.log('\nJSON results:');
console.log(JSON.stringify(results, null, 2));
