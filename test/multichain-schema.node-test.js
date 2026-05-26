/**
 * Multi-chain schema migration tests — Task #1714
 *
 * Verifies that db.js correctly adds chain and chain_contract columns
 * to the tiles table, chain column to events_log, creates the idx_tiles_chain
 * index, and that existing tiles default to chain='base'.
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

  it('events_log table has chain column with default "base"', () => {
    const columns = rawDb.prepare("PRAGMA table_info('events_log')").all();
    const chainCol = columns.find(c => c.name === 'chain');
    assert.ok(chainCol, 'chain column should exist on events_log table');
    assert.equal(chainCol.type, 'TEXT');
    assert.equal(chainCol.notnull, 1, 'events_log chain column should be NOT NULL');
    assert.equal(chainCol.dflt_value, "'base'", 'events_log chain default should be "base"');
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

  it('claimTile accepts chain parameter', () => {
    const tile = db.claimTile(60010, '01casperWallet', 2.0, 'casper');
    assert.ok(tile, 'claimTile with chain should succeed');
    assert.equal(tile.chain, 'casper', 'chain should be "casper"');
    // Clean up
    db.unclaimTile(60010);
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

  it('logEvent persists chain field', () => {
    db.logEvent('heartbeat', 60000, '0xTestWallet', { ping: true }, 'casper');
    const row = rawDb.prepare(
      "SELECT chain FROM events_log WHERE type = 'heartbeat' AND tile_id = 60000"
    ).get();
    assert.ok(row, 'heartbeat event should be logged');
    assert.equal(row.chain, 'casper', 'event chain should be "casper"');
    // Clean up
    rawDb.prepare("DELETE FROM events_log WHERE type = 'heartbeat' AND tile_id = 60000").run();
  });

  it('logEvent defaults chain to "base"', () => {
    db.logEvent('claimed', 60001, '0xOwner', { price: 1.0 });
    const row = rawDb.prepare(
      "SELECT chain FROM events_log WHERE type = 'claimed' AND tile_id = 60001"
    ).get();
    assert.ok(row, 'claimed event should be logged');
    assert.equal(row.chain, 'base', 'default event chain should be "base"');
    // Clean up
    rawDb.prepare("DELETE FROM events_log WHERE type = 'claimed' AND tile_id = 60001").run();
  });
});

describe('Rollback script behavior', () => {
  let rollbackDb;
  let rollbackDir;
  let rollbackDbPath;

  before(() => {
    // Create a separate temp DB for rollback testing
    rollbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-rollback-test-'));
    rollbackDbPath = path.join(rollbackDir, 'tiles.db');
    rollbackDb = new Database(rollbackDbPath);
    rollbackDb.pragma('journal_mode = WAL');

    // Create tiles table with multi-chain columns (mimics post-migration state)
    rollbackDb.exec(`
      CREATE TABLE tiles (
        id            INTEGER PRIMARY KEY,
        owner         TEXT NOT NULL,
        name          TEXT,
        avatar        TEXT,
        description   TEXT,
        category      TEXT,
        color         TEXT,
        status        TEXT NOT NULL DEFAULT 'offline',
        url           TEXT,
        x_handle      TEXT,
        claimed_at    TEXT NOT NULL,
        last_heartbeat INTEGER,
        price_paid    REAL,
        image_url     TEXT,
        chain         TEXT NOT NULL DEFAULT 'base',
        chain_contract TEXT
      );
      CREATE INDEX idx_tiles_owner ON tiles(owner);
      CREATE INDEX idx_tiles_category ON tiles(category);
      CREATE INDEX idx_tiles_status ON tiles(status);
      CREATE INDEX idx_tiles_chain ON tiles(chain);
    `);

    // Insert a test tile
    rollbackDb.prepare(
      "INSERT INTO tiles (id, owner, name, status, claimed_at, price_paid, chain) VALUES (1, '0xTest', 'Tile 1', 'offline', '2026-01-01', 0.01, 'base')"
    ).run();

    // Create events_log with chain column
    rollbackDb.exec(`
      CREATE TABLE events_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT NOT NULL,
        tile_id    INTEGER,
        actor      TEXT,
        metadata   TEXT,
        chain      TEXT NOT NULL DEFAULT 'base',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_events_log_created ON events_log(created_at DESC);
      CREATE INDEX idx_events_log_tile ON events_log(tile_id);
    `);

    rollbackDb.close();
  });

  after(() => {
    fs.rmSync(rollbackDir, { recursive: true, force: true });
  });

  it('rollback script removes chain columns and preserves constraints', () => {
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'rollback-multichain.js');

    // Run the rollback script
    execSync(`node ${scriptPath} ${rollbackDbPath}`, { stdio: 'pipe' });

    // Verify results
    const verifyDb = new Database(rollbackDbPath);

    // Check tiles: chain columns should be gone
    const tilesColumns = verifyDb.prepare("PRAGMA table_info('tiles')").all();
    const colNames = tilesColumns.map(c => c.name);
    assert.ok(!colNames.includes('chain'), 'chain column should be removed');
    assert.ok(!colNames.includes('chain_contract'), 'chain_contract column should be removed');

    // Verify PRIMARY KEY is preserved
    const pkCol = tilesColumns.find(c => c.name === 'id');
    assert.equal(pkCol.pk, 1, 'id should still be PRIMARY KEY');

    // Verify NOT NULL constraints preserved
    const ownerCol = tilesColumns.find(c => c.name === 'owner');
    assert.equal(ownerCol.notnull, 1, 'owner should still be NOT NULL');

    // Verify DEFAULT values preserved
    const statusCol = tilesColumns.find(c => c.name === 'status');
    assert.equal(statusCol.dflt_value, "'offline'", 'status default should be preserved');

    // Verify data is intact
    const tile = verifyDb.prepare('SELECT * FROM tiles WHERE id = 1').get();
    assert.equal(tile.owner, '0xTest');
    assert.equal(tile.name, 'Tile 1');

    // Verify chain index is gone
    const indexes = verifyDb.prepare("PRAGMA index_list('tiles')").all();
    const chainIdx = indexes.find(i => i.name === 'idx_tiles_chain');
    assert.ok(!chainIdx, 'idx_tiles_chain should be removed');

    // Verify events_log chain column removed
    const eventsColumns = verifyDb.prepare("PRAGMA table_info('events_log')").all();
    const eventsColNames = eventsColumns.map(c => c.name);
    assert.ok(!eventsColNames.includes('chain'), 'events_log chain column should be removed');

    verifyDb.close();
  });
});
