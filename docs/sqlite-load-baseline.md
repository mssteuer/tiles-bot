# SQLite WAL Write Concurrency — Baseline Results

**Date:** 2026-04-19
**Environment:** Baremetal server (JeanClaude), Node.js v22.22.2, better-sqlite3

## Methodology

- Benchmark script: `scripts/sqlite-load-bench.mjs`
- Cloned a copy of `data/tiles.db` (WAL mode) for each run — production DB untouched
- Write operations: mixed inserts into `tile_messages`, `tile_emotes`, and `events_log`
- Workers per run: 10, 50, 100 concurrent Node.js worker threads
- Writes per worker: 20 (total: 200, 1000, 2000 writes per concurrency level)
- `busy_timeout = 5000ms` (realistic headroom for WAL contention)

## Results

| Concurrency | Total Writes | Errors | Error Rate | Throughput | p50 (ms) | p95 (ms) | p99 (ms) |
|-------------|-------------|--------|------------|------------|----------|----------|----------|
| 10 writers  | 200         | 0      | 0.0%       | 1,796/sec  | 0.06     | 0.13     | 8.32     |
| 50 writers  | 1,000       | 0      | 0.0%       | 4,058/sec  | 0.07     | 3.29     | 11.25    |
| 100 writers | 2,000       | 0      | 0.0%       | 7,083/sec  | 0.07     | 6.91     | 44.60    |

## ✅ Recommendation: SQLite WAL is Sufficient

- **p95 at 100 concurrent writers: 6.91ms** — well under the 100ms threshold
- **Error rate: 0% at all levels** — zero `SQLITE_BUSY` or `SQLITE_LOCKED` errors
- **Throughput scales well** — 7k+ writes/sec at 100 concurrent writers
- WAL mode with `busy_timeout = 5000ms` handles the concurrency without contention

## When to Revisit

Revisit this decision if:
- Pixel wars activate with sustained bursts of 500+ concurrent users
- Write patterns shift to long-running transactions (currently all single-row inserts)
- p95 write latency rises above 50ms in production monitoring

## Postgres Migration Trigger

If at any point production monitoring shows p95 > 100ms or error rate > 1% under real traffic, migrate to Postgres. The threshold is well-documented: see `docs/architecture.md`.
