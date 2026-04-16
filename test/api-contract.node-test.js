/**
 * API contract tests — grid, stats, tiles, collection endpoints
 * Task #702 (original), expanded by Task #791
 *
 * Runs against a live local server on port 8084.
 * Usage: node test/api-contract.node-test.js
 */

const assert = require('node:assert/strict');
const http = require('node:http');

const BASE_URL = 'http://localhost:8084';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${path}: ${e.message}\nBody: ${body.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  // ── GET /api/stats ──────────────────────────────────────────────
  console.log('\n📊 GET /api/stats');
  const stats = await get('/api/stats');

  check('returns 200', () => assert.equal(stats.status, 200));
  check('has claimed (number)', () => assert.equal(typeof stats.body.claimed, 'number'));
  check('has available (number)', () => assert.equal(typeof stats.body.available, 'number'));
  check('has total (number)', () => assert.equal(typeof stats.body.total, 'number'));
  check('total = claimed + available', () => assert.equal(stats.body.total, stats.body.claimed + stats.body.available));
  check('has currentPrice (number)', () => assert.equal(typeof stats.body.currentPrice, 'number'));
  check('has totalRevenue (number)', () => assert.equal(typeof stats.body.totalRevenue, 'number'));
  check('claimed is non-negative', () => assert.ok(stats.body.claimed >= 0));
  check('available is non-negative', () => assert.ok(stats.body.available >= 0));

  // ── GET /api/grid ───────────────────────────────────────────────
  console.log('\n🔲 GET /api/grid');
  const grid = await get('/api/grid');

  check('returns 200', () => assert.equal(grid.status, 200));
  check('has tiles (object)', () => assert.equal(typeof grid.body.tiles, 'object'));
  check('tiles is not null', () => assert.ok(grid.body.tiles !== null));

  // Shape-check the first claimed tile
  const tileIds = Object.keys(grid.body.tiles || {});
  check('at least one tile in grid', () => assert.ok(tileIds.length > 0));
  if (tileIds.length > 0) {
    const firstTile = grid.body.tiles[tileIds[0]];
    check('grid tile has id', () => assert.ok('id' in firstTile));
    check('grid tile id is number', () => assert.equal(typeof firstTile.id, 'number'));
    check('grid tile has owner (string)', () => assert.equal(typeof firstTile.owner, 'string'));
    check('grid tile has name (string)', () => assert.equal(typeof firstTile.name, 'string'));
    check('grid tile has status (string)', () => assert.equal(typeof firstTile.status, 'string'));
  }

  // ── GET /api/tiles/:id ─────────────────────────────────────────
  console.log('\n🧩 GET /api/tiles/1');
  const tile = await get('/api/tiles/1');

  check('returns 200', () => assert.equal(tile.status, 200));
  check('has name (string)', () => assert.equal(typeof tile.body.name, 'string'));
  check('has description', () => assert.ok('description' in tile.body));
  check('has image (string)', () => assert.equal(typeof tile.body.image, 'string'));
  check('has external_url (string)', () => assert.equal(typeof tile.body.external_url, 'string'));
  check('has attributes (array)', () => assert.ok(Array.isArray(tile.body.attributes)));
  check('attributes have trait_type', () => {
    assert.ok(tile.body.attributes.length > 0);
    assert.ok(tile.body.attributes.every((a) => 'trait_type' in a && 'value' in a));
  });

  // ── GET /api/tiles/:id — unclaimed tile ────────────────────────
  console.log('\n🧩 GET /api/tiles/65535 (likely unclaimed)');
  const unclaimedTile = await get('/api/tiles/65535');
  check('returns 200', () => assert.equal(unclaimedTile.status, 200));
  check('has name (string)', () => assert.equal(typeof unclaimedTile.body.name, 'string'));

  // ── GET /api/collection ────────────────────────────────────────
  console.log('\n📦 GET /api/collection');
  const collection = await get('/api/collection');

  check('returns 200', () => assert.equal(collection.status, 200));
  check('has name (string)', () => assert.equal(typeof collection.body.name, 'string'));
  check('name is not empty', () => assert.ok(collection.body.name.length > 0));
  check('has description (string)', () => assert.equal(typeof collection.body.description, 'string'));
  check('has image (string)', () => assert.equal(typeof collection.body.image, 'string'));
  check('has external_link (string)', () => assert.equal(typeof collection.body.external_link, 'string'));
  check('has seller_fee_basis_points (number)', () => assert.equal(typeof collection.body.seller_fee_basis_points, 'number'));

  // ── Summary ────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ${failed > 0 ? '❌' : '✅'} ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
