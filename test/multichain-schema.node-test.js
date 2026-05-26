/**
 * Multi-chain schema migration tests — Task #1714
 *
 * Verifies that db.js correctly adds chain and chain_contract columns
 * to the tiles table, creates the idx_tiles_chain index, and that
 * existing tiles default to chain='base'.
 *
 * Uses an isolated in-memory SQLite database via DB_DIR override.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

// Create a temp directory for the test database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-multichain-test-'));

// Override DB_DIR before importing db.js
process.env.DB_DIR = tmpDir;

// We need to dynamically import the ES module
let db;

describe('Multi-chain schema migration', () => {
  let rawDb;

  before(async () => {
    // Import the db module — this triggers initSchema()
    db = await import('../src/lib/db.js');
    // Open a raw connection to inspect schema
    rawDb = new Database(path.join(tmpDir, 'tiles.db'));
  });

  after(() => {
    if (rawDb) rawDb.close();
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tiles table has chain column with default "base"', () => {
    const columns = rawDb.prepare("PRAGMA table_info('tiles')").all();
    const chainCol = columns.find(c => c.name === 'chain');
    assert.ok(chainCol, 'chain column should exist on tiles table');
    assert.equal(chainCol.type, 'TEXT');
    assert.equal(chainCol.notnull, 1, 'chain column should be NOT NULL');
    assert.equal(chainCol.dflt_value, "'base'", 'chain column default should be "base"');
  });

  it('tiles table has chain_contract column', () => {
    const columns = rawDb.prepare("PRAGMA table_info('tiles')").all();
    const ccCol = columns.find(c => c.name === 'chain_contract');
    assert.ok(ccCol, 'chain_contract column should exist on tiles table');
    assert.equal(ccCol.type, 'TEXT');
  });

  it('idx_tiles_chain index exists', () => {
    const indexes = rawDb.prepare("PRAGMA index_list('tiles')").all();
    const chainIdx = indexes.find(i => i.name === 'idx_tiles_chain');
    assert.ok(chainIdx, 'idx_tiles_chain index should exist');
  });

  it('existing tiles default to chain="base"', () => {
    // Insert a tile the old way (no chain column in INSERT)
    rawDb.prepare(
      "INSERT OR IGNORE INTO tiles (id, owner, name, status, claimed_at) VALUES (99999, '0xtest', 'Test Tile', 'offline', '2026-01-01T00:00:00Z')"
    ).run();
    const row = rawDb.prepare('SELECT chain, chain_contract FROM tiles WHERE id = 99999').get();
    assert.equal(row.chain, 'base', 'default chain should be "base"');
    assert.equal(row.chain_contract, null, 'chain_contract should default to null');
    // Clean up
    rawDb.prepare('DELETE FROM tiles WHERE id = 99999').run();
  });

  it('claimTile returns tile with chain field', () => {
    const tile = db.claimTile(60000, '0xTestWallet', 1.5);
    assert.ok(tile, 'claimTile should succeed');
    assert.equal(tile.chain, 'base', 'default chain should be "base"');
    assert.equal(tile.chainContract, null, 'chainContract should be null by default');
    // Clean up
    db.unclaimTile(60000);
  });

  it('rowToTile exposes chain and chainContract', () => {
    // Insert a tile with explicit chain values
    rawDb.prepare(
      "INSERT OR IGNORE INTO tiles (id, owner, name, status, claimed_at, chain, chain_contract) VALUES (60001, '01abcd', 'Casper Tile', 'offline', '2026-01-01T00:00:00Z', 'casper', 'hash-abc123')"
    ).run();
    const tile = db.getTile(60001);
    assert.ok(tile, 'getTile should return the tile');
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.chainContract, 'hash-abc123');
    // Clean up
    rawDb.prepare('DELETE FROM tiles WHERE id = 60001').run();
  });

  it('setTile persists chain and chainContract', () => {
    db.setTile(60002, {
      id: 60002,
      owner: '01casper_owner',
      name: 'My Casper Tile',
      status: 'offline',
      claimedAt: '2026-01-01T00:00:00Z',
      chain: 'casper',
      chainContract: 'hash-xyz789',
    });
    const tile = db.getTile(60002);
    assert.equal(tile.chain, 'casper');
    assert.equal(tile.chainContract, 'hash-xyz789');
    // Clean up
    db.unclaimTile(60002);
  });

  it('syncOnChainClaim persists chain', () => {
    db.syncOnChainClaim(60003, '01sync_owner', '2026-01-01T00:00:00Z', 2.5, 'casper');
    const tile = db.getTile(60003);
    assert.ok(tile, 'tile should exist after sync');
    assert.equal(tile.chain, 'casper');
    // Clean up
    rawDb.prepare('DELETE FROM tiles WHERE id = 60003').run();
  });
});
