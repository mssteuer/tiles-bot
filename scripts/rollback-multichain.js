#!/usr/bin/env node

/**
 * Rollback migration: Remove multi-chain columns from tiles table and events_log.
 *
 * SQLite doesn't support DROP COLUMN before v3.35.0. This script uses
 * the table-rebuild approach for maximum compatibility:
 *   1. Create a new table with proper DDL (preserving all constraints)
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

/**
 * Build a CREATE TABLE statement from PRAGMA table_info, preserving
 * PRIMARY KEY, NOT NULL, DEFAULT, and AUTOINCREMENT.
 *
 * @param {string} tableName - Source table
 * @param {string[]} dropColumns - Column names to exclude
 * @param {string} newName - Name for the new table
 */
function buildCreateTableWithout(tableName, dropColumns, newName) {
  const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all();
  const kept = cols.filter(c => !dropColumns.includes(c.name));

  // Check if original DDL uses AUTOINCREMENT
  const masterRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  const hasAutoincrement = masterRow && /AUTOINCREMENT/i.test(masterRow.sql);

  const colDefs = kept.map(c => {
    let def = `${c.name} ${c.type || 'TEXT'}`;
    if (c.pk) {
      def += ' PRIMARY KEY';
      if (hasAutoincrement) def += ' AUTOINCREMENT';
    }
    if (c.notnull && !c.pk) def += ' NOT NULL';
    if (c.dflt_value !== null) {
      // Expression defaults (e.g. datetime('now')) need wrapping in ()
      const isExpression = /[()]/.test(c.dflt_value) && !c.dflt_value.startsWith("'");
      def += isExpression ? ` DEFAULT (${c.dflt_value})` : ` DEFAULT ${c.dflt_value}`;
    }
    return def;
  });

  return `CREATE TABLE ${newName} (\n  ${colDefs.join(',\n  ')}\n)`;
}

// Get columns to keep for tiles
const keepColumns = columns
  .filter(c => c.name !== 'chain' && c.name !== 'chain_contract')
  .map(c => c.name);
const columnList = keepColumns.join(', ');

db.exec('BEGIN TRANSACTION');
try {
  // Drop the chain index first
  db.exec('DROP INDEX IF EXISTS idx_tiles_chain');

  // Create new table with proper DDL (preserving constraints)
  const createDDL = buildCreateTableWithout('tiles', ['chain', 'chain_contract'], 'tiles_rollback');
  db.exec(createDDL);

  // Copy data
  db.exec(`INSERT INTO tiles_rollback SELECT ${columnList} FROM tiles`);

  // Swap tables
  db.exec('DROP TABLE tiles');
  db.exec('ALTER TABLE tiles_rollback RENAME TO tiles');

  // Recreate indexes (without chain index)
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(owner)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_category ON tiles(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tiles_status ON tiles(status)');

  // Rollback events_log chain column if present
  const eventsColumns = db.prepare("PRAGMA table_info('events_log')").all();
  const hasEventsChain = eventsColumns.some(c => c.name === 'chain');
  if (hasEventsChain) {
    const eventsKeepColumns = eventsColumns
      .filter(c => c.name !== 'chain')
      .map(c => c.name);
    const eventsColumnList = eventsKeepColumns.join(', ');

    const eventsCreateDDL = buildCreateTableWithout('events_log', ['chain'], 'events_log_new');
    db.exec(eventsCreateDDL);
    db.exec(`INSERT INTO events_log_new SELECT ${eventsColumnList} FROM events_log`);
    db.exec('DROP TABLE events_log');
    db.exec('ALTER TABLE events_log_new RENAME TO events_log');
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_log_created ON events_log(created_at DESC)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_log_tile ON events_log(tile_id)');
    console.log('Rolled back events_log chain column.');
  }

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
