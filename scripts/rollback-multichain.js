#!/usr/bin/env node

/**
 * Rollback migration: Remove multi-chain columns from tiles table.
 *
 * SQLite doesn't support DROP COLUMN before v3.35.0. This script uses
 * the table-rebuild approach for maximum compatibility:
 *   1. Create a new table without the multi-chain columns
 *   2. Copy data (only the original columns)
 *   3. Drop old table
 *   4. Rename new table
 *   5. Recreate indexes
 *
 * Usage:
 *   node scripts/rollback-multichain.js [path-to-tiles.db]
 *
 * Default DB path: data/tiles.db
 *
 * IMPORTANT: Stop the tiles-bot service before running this script.
 *            Back up your database first!
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tiles.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

// Verify the columns exist before attempting rollback
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Required for table rebuild

const columns = db.prepare("PRAGMA table_info('tiles')").all();
const hasChain = columns.some(c => c.name === 'chain');
const hasChainContract = columns.some(c => c.name === 'chain_contract');

if (!hasChain && !hasChainContract) {
  console.log('Nothing to rollback: chain and chain_contract columns do not exist.');
  db.close();
  process.exit(0);
}

// Check for non-base tiles that would lose data
const nonBaseTiles = db.prepare("SELECT COUNT(*) as cnt FROM tiles WHERE chain != 'base'").get();
if (nonBaseTiles.cnt > 0) {
  console.error(`WARNING: ${nonBaseTiles.cnt} tiles have chain != 'base'. These will lose their chain data.`);
  console.error('Aborting. To force rollback, set FORCE_ROLLBACK=1');
  if (!process.env.FORCE_ROLLBACK) {
    db.close();
    process.exit(1);
  }
  console.error('FORCE_ROLLBACK set. Proceeding...');
}

console.log(`Rolling back multi-chain columns from: ${dbPath}`);

// Get all column names except chain and chain_contract
const keepColumns = columns
  .filter(c => c.name !== 'chain' && c.name !== 'chain_contract')
  .map(c => c.name);

const columnList = keepColumns.join(', ');

// Build CREATE TABLE statement from existing schema, minus the multi-chain columns
// We need the original CREATE TABLE SQL
const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tiles'").get();

db.exec('BEGIN TRANSACTION');
try {
  // Drop the chain index first
  db.exec('DROP INDEX IF EXISTS idx_tiles_chain');

  // Create temp table with same structure minus chain columns
  db.exec(`CREATE TABLE tiles_rollback AS SELECT ${columnList} FROM tiles`);

  // Drop original
  db.exec('DROP TABLE tiles');

  // Rename rollback table
  db.exec('ALTER TABLE tiles_rollback RENAME TO tiles');

  // Recreate the original indexes (without the chain index)
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(owner)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_category ON tiles(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_status ON tiles(status)');

  db.exec('COMMIT');
  console.log('Rollback complete. Columns removed: chain, chain_contract');
  console.log('Index removed: idx_tiles_chain');
  console.log(`Retained ${keepColumns.length} columns: ${columnList}`);
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Rollback failed:', err.message);
  process.exit(1);
} finally {
  db.pragma('foreign_keys = ON');
  db.close();
}
