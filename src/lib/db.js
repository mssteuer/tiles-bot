// Persistent SQLite store for MillionBotHomepage tile data
// Replaces the in-memory store.js with durable storage.
//
// SQLite is the right choice here:
//   - No infra required, single file
//   - 65,536 tiles is small data (~few MB max)
//   - Metadata cache — blockchain is the canonical source of truth
//   - Works with Node.js server deployments (not Vercel Edge)

import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'tiles.db');

// Ensure data directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

let _db;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tiles (
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
      image_url     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tiles_owner ON tiles(owner);
    CREATE INDEX IF NOT EXISTS idx_tiles_category ON tiles(category);
    CREATE INDEX IF NOT EXISTS idx_tiles_status ON tiles(status);
  `);
  // Add image_url column if it doesn't exist (migration for existing DBs)
  try { db.exec(`ALTER TABLE tiles ADD COLUMN image_url TEXT`); } catch {}
  // Add tx_hash column if it doesn't exist (migration for existing DBs)
  try { db.exec(`ALTER TABLE tiles ADD COLUMN tx_hash TEXT`); } catch {}
}

// ─── Read helpers ────────────────────────────────────────────────────────────

function rowToTile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || `Tile #${row.id}`,
    avatar: row.avatar || null,
    description: row.description || null,
    category: row.category || null,
    color: row.color || null,
    status: row.status,
    url: row.url || null,
    xHandle: row.x_handle || null,
    owner: row.owner,
    claimedAt: row.claimed_at,
    lastHeartbeat: row.last_heartbeat || null,
    pricePaid: row.price_paid || null,
    imageUrl: row.image_url || null,
    txHash: row.tx_hash || null,
  };
}

// ─── Public API (drop-in replacement for store.js) ───────────────────────────

export const TOTAL_TILES = 65536;
export const HEARTBEAT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getTile(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
  return rowToTile(row);
}

export function setTile(id, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO tiles
      (id, owner, name, avatar, description, category, color, status, url, x_handle, claimed_at, last_heartbeat, price_paid)
    VALUES
      (@id, @owner, @name, @avatar, @description, @category, @color, @status, @url, @x_handle, @claimed_at, @last_heartbeat, @price_paid)
  `).run({
    id: data.id,
    owner: data.owner,
    name: data.name || null,
    avatar: data.avatar || null,
    description: data.description || null,
    category: data.category || null,
    color: data.color || null,
    status: data.status || 'offline',
    url: data.url || null,
    x_handle: data.xHandle || null,
    claimed_at: data.claimedAt || new Date().toISOString(),
    last_heartbeat: data.lastHeartbeat || null,
    price_paid: data.pricePaid || null,
  });
}

export function getAllTiles() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tiles').all();
  const result = {};
  for (const row of rows) {
    const tile = rowToTile(row);
    result[tile.id] = tile;
  }
  return result;
}

export function getClaimedCount() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM tiles').get();
  return row.cnt;
}

// Exponential bonding curve: price = e^(ln(11111) * totalMinted / 65536)
export function getCurrentPrice() {
  const totalMinted = getClaimedCount();
  // Curve: $0.01 → $111 (divide original $1→$11,111 by 100)
  return Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES) / 100;
}

export function claimTile(id, wallet, pricePaid) {
  const db = getDb();
  if (id < 0 || id >= TOTAL_TILES) return null;

  // Check if already claimed (atomic with INSERT)
  const existing = db.prepare('SELECT id FROM tiles WHERE id = ?').get(id);
  if (existing) return null; // already claimed

  const tile = {
    id,
    name: `Tile #${id}`,
    avatar: null,
    description: null,
    category: null,
    color: null,
    status: 'offline',
    url: null,
    xHandle: null,
    owner: wallet,
    claimedAt: new Date().toISOString(),
    lastHeartbeat: null,
    pricePaid: pricePaid || null,
  };

  db.prepare(`
    INSERT INTO tiles (id, owner, name, status, claimed_at, price_paid)
    VALUES (@id, @owner, @name, @status, @claimed_at, @price_paid)
  `).run({
    id: tile.id,
    owner: tile.owner,
    name: tile.name,
    status: tile.status,
    claimed_at: tile.claimedAt,
    price_paid: tile.pricePaid,
  });

  return tile;
}

export function updateTileMetadata(id, metadata) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
  if (!existing) return null;

  const allowed = ['name', 'avatar', 'description', 'category', 'color', 'url', 'xHandle', 'imageUrl'];
  const updates = {};
  for (const key of allowed) {
    if (metadata[key] !== undefined) {
      // Map camelCase to snake_case column names
      const colMap = { xHandle: 'x_handle', imageUrl: 'image_url' };
      const col = colMap[key] || key;
      updates[col] = metadata[key];
    }
  }

  if (Object.keys(updates).length === 0) return rowToTile(existing);

  const setClauses = Object.keys(updates).map(col => `${col} = @${col}`).join(', ');
  db.prepare(`UPDATE tiles SET ${setClauses} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
  return rowToTile(updated);
}

export function heartbeat(id, wallet) {
  const db = getDb();
  const tile = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
  if (!tile || tile.owner !== wallet) return null;

  const now = Date.now();
  db.prepare('UPDATE tiles SET status = ?, last_heartbeat = ? WHERE id = ?')
    .run('online', now, id);

  return rowToTile({ ...tile, status: 'online', last_heartbeat: now });
}

// Mark stale heartbeats as offline
export function checkHeartbeats() {
  const db = getDb();
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  db.prepare(`
    UPDATE tiles SET status = 'offline'
    WHERE status = 'online' AND last_heartbeat IS NOT NULL AND last_heartbeat < ?
  `).run(cutoff);
}

/**
 * Find the lowest unclaimed tile ID.
 * Scans for the first gap in the tiles table (tiles are sparse: not every ID exists).
 * Returns 0 if no tiles claimed yet.
 */
export function getNextAvailableTileId() {
  const db = getDb();
  const totalMinted = getClaimedCount();
  if (totalMinted === 0) return 0;

  // Find the smallest ID NOT in the tiles table in range [0, totalMinted+1]
  // Use a simple approach: get all claimed IDs sorted, find first gap
  const rows = db.prepare('SELECT id FROM tiles ORDER BY id ASC').all();
  const claimedSet = new Set(rows.map(r => r.id));

  for (let i = 0; i < TOTAL_TILES; i++) {
    if (!claimedSet.has(i)) return i;
  }
  return TOTAL_TILES - 1; // all claimed (shouldn't happen)
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

// All tiles in DB are claimed (no row = unclaimed). Status tracks online/offline heartbeat.
export function getRecentlyClaimed(limit = 10) {
  const db = getDb();
  return db.prepare(
    'SELECT id, name, owner, claimed_at FROM tiles ORDER BY claimed_at DESC LIMIT ?'
  ).all(limit);
}

export function getTopHolders(limit = 10) {
  const db = getDb();
  return db.prepare(
    'SELECT owner, COUNT(*) as count FROM tiles GROUP BY owner ORDER BY count DESC LIMIT ?'
  ).all(limit);
}

// ─── Admin / sync helpers ─────────────────────────────────────────────────────

/**
 * Upsert a tile claim from on-chain data (for sync with blockchain events).
 * Used by the indexer/sync mechanism when it reads on-chain claims.
 */
/**
 * Roll back a DB claim if the on-chain tx fails (removes the tile row so it can be re-claimed).
 */
export function unclaimTile(id) {
  const db = getDb();
  db.prepare('DELETE FROM tiles WHERE id = ?').run(id);
}

/**
 * Update the tx_hash for an already-claimed tile (called after on-chain claim tx confirmed).
 */
export function setTileTxHash(id, txHash) {
  const db = getDb();
  db.prepare('UPDATE tiles SET tx_hash = ? WHERE id = ?').run(txHash, id);
}

export function syncOnChainClaim(id, owner, claimedAt, pricePaid) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO tiles (id, owner, name, status, claimed_at, price_paid)
    VALUES (@id, @owner, @name, 'offline', @claimed_at, @price_paid)
  `).run({
    id,
    owner,
    name: `Tile #${id}`,
    claimed_at: claimedAt || new Date().toISOString(),
    price_paid: pricePaid || null,
  });
}

/**
 * Get tiles by owner address (for agent dashboard).
 */
export function getTilesByOwner(owner) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tiles WHERE owner = ?').all(owner);
  return rows.map(rowToTile);
}

/**
 * Get grid state as sparse array for efficient frontend rendering.
 * Returns only claimed tiles (not all 65,536 slots).
 */
export function getGridState() {
  return getAllTiles();
}

// Close DB gracefully on process exit
process.on('exit', () => { if (_db) _db.close(); });
process.on('SIGINT', () => { if (_db) { _db.close(); process.exit(0); } });
process.on('SIGTERM', () => { if (_db) { _db.close(); process.exit(0); } });
