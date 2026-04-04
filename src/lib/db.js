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
    _db.pragma('busy_timeout = 5000');
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

    CREATE TABLE IF NOT EXISTS tile_connections (
      from_id  INTEGER NOT NULL,
      to_id    INTEGER NOT NULL,
      label    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (from_id, to_id),
      CHECK (from_id <> to_id),
      CHECK (from_id < to_id)
    );
    CREATE INDEX IF NOT EXISTS idx_connections_from ON tile_connections(from_id);
    CREATE INDEX IF NOT EXISTS idx_connections_to ON tile_connections(to_id);
  `);
  // Add image_url column if it doesn't exist (migration for existing DBs)
  try { db.exec(`ALTER TABLE tiles ADD COLUMN image_url TEXT`); } catch {}
  // Add tx_hash column if it doesn't exist (migration for existing DBs)
  try { db.exec(`ALTER TABLE tiles ADD COLUMN tx_hash TEXT`); } catch {}
  // Add github_verified, x_verified columns (migration for existing DBs)
  try { db.exec(`ALTER TABLE tiles ADD COLUMN github_verified INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN github_username TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN github_gist_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN x_verified INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN x_handle_verified TEXT`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN x_tweet_url TEXT`); } catch {}
  // Block tiles — each tile can belong to at most one block
  try { db.exec(`ALTER TABLE tiles ADD COLUMN block_id INTEGER`); } catch {}
  // Block metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_blocks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      block_size  INTEGER NOT NULL CHECK(block_size IN (2, 3)),
      top_left_id INTEGER NOT NULL UNIQUE,
      owner       TEXT NOT NULL,
      name        TEXT,
      avatar      TEXT,
      description TEXT,
      category    TEXT,
      color       TEXT,
      url         TEXT,
      image_url   TEXT,
      status      TEXT NOT NULL DEFAULT 'offline',
      last_heartbeat INTEGER,
      claimed_at  TEXT NOT NULL,
      tile_ids    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_owner ON tile_blocks(owner);
    CREATE INDEX IF NOT EXISTS idx_blocks_top_left ON tile_blocks(top_left_id);

    CREATE TABLE IF NOT EXISTS tile_spans (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      top_left_id      INTEGER NOT NULL UNIQUE,
      owner            TEXT NOT NULL,
      width            INTEGER NOT NULL CHECK(width BETWEEN 1 AND 16),
      height           INTEGER NOT NULL CHECK(height BETWEEN 1 AND 16),
      name             TEXT,
      description      TEXT,
      image_url        TEXT,
      slice_image_urls TEXT,
      status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','error')),
      claimed_at       TEXT NOT NULL,
      tile_ids         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tile_spans_owner ON tile_spans(owner);
    CREATE INDEX IF NOT EXISTS idx_tile_spans_top_left ON tile_spans(top_left_id);
    CREATE INDEX IF NOT EXISTS idx_tile_spans_status ON tile_spans(status);
  `);

  try { db.exec(`ALTER TABLE tiles ADD COLUMN span_id INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE tile_spans ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','error'))`); } catch {}
  try { db.exec(`ALTER TABLE tile_blocks ADD COLUMN status TEXT NOT NULL DEFAULT 'offline'`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN rep_score REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE tiles ADD COLUMN effects TEXT`); } catch {}
}

export function getRectTileIds(topLeftId, width, height, gridSize = GRID_SIZE) {
  if (!Number.isInteger(topLeftId) || topLeftId < 0 || topLeftId >= gridSize * gridSize) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || width > 16 || height < 1 || height > 16) return null;
  if (width === 1 && height === 1) return null;

  const col = topLeftId % gridSize;
  const row = Math.floor(topLeftId / gridSize);
  if (col + width > gridSize || row + height > gridSize) return null;

  const ids = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      ids.push((row + r) * gridSize + (col + c));
    }
  }
  return ids;
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
    blockId: row.block_id || null,
    spanId: row.span_id || null,
    githubVerified: row.github_verified === 1,
    githubUsername: row.github_username || null,
    githubGistId: row.github_gist_id || null,
    xVerified: row.x_verified === 1,
    xHandleVerified: row.x_handle_verified || null,
    xTweetUrl: row.x_tweet_url || null,
    repScore: row.rep_score != null ? row.rep_score : 0,
    hasTrophy: row.trophy_expires_at ? new Date(row.trophy_expires_at) > new Date() : false,
    effects: row.effects ? JSON.parse(row.effects) : null,
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

/**
 * Get all claimed tile IDs (for sitemap generation).
 */
export function getClaimedTileIds() {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM tiles ORDER BY id ASC').all();
  return rows.map(r => r.id);
}

/**
 * Get all claimed tiles as full objects, sorted by ID.
 * Excludes null/zero address tiles.
 * Optional category filter.
 */
export function getClaimedTiles({ category = null } = {}) {
  const db = getDb();
  let sql = `SELECT * FROM tiles WHERE owner IS NOT NULL AND owner != '0x0000000000000000000000000000000000000000'`;
  const params = [];
  if (category && category !== 'all') {
    sql += ` AND category = ?`;
    params.push(category);
  }
  sql += ` ORDER BY claimed_at ASC`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToTile);
}

// Exponential bonding curve: price = e^(ln(11111) * totalMinted / 65536)
export function getCurrentPrice() {
  const totalMinted = getClaimedCount();
  // Curve: $0.01 → $111 (divide original $1→$11,111 by 100)
  return Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES) / 100;
}

// Progressive pricing: sum of bonding curve prices for N sequential mints
export function getBatchPrice(count) {
  const totalMinted = getClaimedCount();
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.exp(Math.log(11111) * (totalMinted + i) / TOTAL_TILES) / 100;
  }
  return total;
}

export function claimTile(id, wallet, pricePaid) {
  const db = getDb();
  if (id < 0 || id >= TOTAL_TILES) return null;

  // Check if already claimed before insert.
  const existing = db.prepare('SELECT id FROM tiles WHERE id = ?').get(id);
  if (existing) return null;

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

export function unclaimTile(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM tiles WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateTileMetadata(id, metadata) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
  if (!existing) return null;

  const allowed = ['name', 'avatar', 'description', 'category', 'color', 'url', 'xHandle', 'imageUrl', 'effects'];
  const updates = {};
  for (const key of allowed) {
    if (metadata[key] !== undefined) {
      // Map camelCase to snake_case column names
      const colMap = { xHandle: 'x_handle', imageUrl: 'image_url', effects: 'effects' };
      const col = colMap[key] || key;
      // JSON-encode object fields
      updates[col] = (key === 'effects' && metadata[key] !== null)
        ? JSON.stringify(metadata[key])
        : metadata[key];
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
    "SELECT owner, COUNT(*) as count FROM tiles WHERE owner != '0x0000000000000000000000000000000000000000' GROUP BY owner ORDER BY count DESC LIMIT ?"
  ).all(limit);
}

// Precompute the full bonding-curve revenue once at module load.
// 65,536 iterations is trivial here and avoids recalculating the same sum on every request.
const ESTIMATED_SOLD_OUT_REVENUE = (() => {
  let total = 0;
  for (let minted = 0; minted < TOTAL_TILES; minted++) {
    total += Math.exp(Math.log(11111) * minted / TOTAL_TILES) / 100;
  }
  return total;
})();

export function getEstimatedSoldOutRevenue() {
  return ESTIMATED_SOLD_OUT_REVENUE;
}

/**
 * Sum all price_paid values from claimed tiles.
 * Falls back to estimating from the bonding curve for tiles without recorded price.
 */
export function getTotalRevenue() {
  const db = getDb();
  // Sum recorded price_paid values (on-chain claims have this)
  const row = db.prepare('SELECT SUM(COALESCE(price_paid, 0)) as total FROM tiles').get();
  return row?.total ?? 0;
}

// ─── Admin / sync helpers ─────────────────────────────────────────────────────

/**
 * Update the tx_hash for an already-claimed tile (called after on-chain claim tx confirmed).
 */
export function setTileTxHash(id, txHash) {
  const db = getDb();
  const result = db.prepare('UPDATE tiles SET tx_hash = ? WHERE id = ?').run(txHash, id);
  return result.changes > 0;
}

/**
 * Upsert a tile claim from on-chain data (for sync with blockchain events).
 * Used by the indexer/sync mechanism when it reads on-chain claims.
 */
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
function hasColumn(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info('${tableName}')`).all();
  return columns.some((col) => col.name === columnName);
}

function hasTileSpanStatusColumn(db) {
  return hasColumn(db, 'tile_spans', 'status');
}

function tileSpanRowToObj(row) {
  if (!row) return null;
  return {
    id: row.id,
    topLeftId: row.top_left_id,
    owner: row.owner,
    width: row.width,
    height: row.height,
    name: row.name || null,
    description: row.description || null,
    imageUrl: row.image_url || null,
    sliceImageUrls: row.slice_image_urls ? JSON.parse(row.slice_image_urls) : {},
    status: row.status || 'pending',
    claimedAt: row.claimed_at,
    tileIds: JSON.parse(row.tile_ids),
  };
}

function cleanupSpanAfterTileRemoval(db, spanId) {
  const row = db.prepare('SELECT * FROM tile_spans WHERE id = ?').get(spanId);
  if (!row) return;
  const span = tileSpanRowToObj(row);
  const retainedTileIds = span.tileIds.filter((tileId) => {
    const tileRow = db.prepare('SELECT span_id FROM tiles WHERE id = ?').get(tileId);
    return tileRow?.span_id === spanId;
  });

  if (retainedTileIds.length < 2) {
    db.prepare('UPDATE tiles SET span_id = NULL WHERE span_id = ?').run(spanId);
    db.prepare('DELETE FROM tile_spans WHERE id = ?').run(spanId);
    return;
  }

  if (retainedTileIds.length !== span.tileIds.length) {
    db.prepare('UPDATE tile_spans SET tile_ids = ? WHERE id = ?').run(JSON.stringify(retainedTileIds), spanId);
  }
}

export function createTileSpan({ topLeftId, width, height, owner }) {
  const db = getDb();

  const tileCount = width * height;
  if (tileCount < 2) throw new Error('Span must cover at least 2 tiles');

  const tileIds = getRectTileIds(topLeftId, width, height);
  if (!tileIds) {
    throw new Error('Span dimensions must stay inside the grid and each side must be between 1 and 16');
  }
  if (tileCount > 256) throw new Error('Span cannot exceed 256 tiles');

  const tx = db.transaction(() => {
    const placeholders = tileIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, owner, span_id FROM tiles WHERE id IN (${placeholders})`).all(...tileIds);

    if (rows.length !== tileIds.length) {
      throw new Error('All tiles in the span must already be claimed by the same wallet');
    }

    const previousSpanIds = [];
    for (const row of rows) {
      if (!row.owner || row.owner.toLowerCase() !== owner.toLowerCase()) {
        throw new Error('All tiles in the span must be owned by the same wallet');
      }
      if (row.span_id) previousSpanIds.push(row.span_id);
    }

    if (previousSpanIds.length) {
      db.prepare(`UPDATE tiles SET span_id = NULL WHERE id IN (${placeholders})`).run(...tileIds);
      for (const spanId of [...new Set(previousSpanIds)]) cleanupSpanAfterTileRemoval(db, spanId);
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO tile_spans (top_left_id, owner, width, height, claimed_at, tile_ids, slice_image_urls, status)
      VALUES (@top_left_id, @owner, @width, @height, @claimed_at, @tile_ids, @slice_image_urls, @status)
    `).run({
      top_left_id: topLeftId,
      owner,
      width,
      height,
      claimed_at: now,
      tile_ids: JSON.stringify(tileIds),
      slice_image_urls: JSON.stringify({}),
      status: 'pending',
    });

    const spanId = Number(result.lastInsertRowid);
    db.prepare(`UPDATE tiles SET span_id = ? WHERE id IN (${placeholders})`).run(spanId, ...tileIds);
    return getTileSpan(spanId);
  });

  return tx();
}

export function getTileSpan(spanId) {
  const db = getDb();
  return tileSpanRowToObj(db.prepare('SELECT * FROM tile_spans WHERE id = ?').get(spanId));
}

export function getTileSpanByTopLeft(topLeftId) {
  const db = getDb();
  return tileSpanRowToObj(db.prepare('SELECT * FROM tile_spans WHERE top_left_id = ?').get(topLeftId));
}

export function getTileSpanForTile(tileId) {
  const tile = getTile(tileId);
  if (!tile?.spanId) return null;
  return getTileSpan(tile.spanId);
}

export function getAllTileSpans(options = {}) {
  const db = getDb();
  const includeNonReady = options.includeNonReady === true;
  const hasStatus = hasTileSpanStatusColumn(db);
  const rows = includeNonReady || !hasStatus
    ? db.prepare('SELECT * FROM tile_spans ORDER BY id ASC').all()
    : db.prepare("SELECT * FROM tile_spans WHERE status = 'ready' ORDER BY id ASC").all();
  return rows
    .map(tileSpanRowToObj)
    .filter((span) => includeNonReady || !hasStatus || span.status === 'ready');
}

export function updateTileSpan(spanId, metadata) {
  const db = getDb();
  const existing = getTileSpan(spanId);
  if (!existing) return null;

  const updates = {};
  if (metadata.name !== undefined) updates.name = metadata.name;
  if (metadata.description !== undefined) updates.description = metadata.description;
  if (metadata.imageUrl !== undefined) updates.image_url = metadata.imageUrl;
  if (metadata.sliceImageUrls !== undefined) updates.slice_image_urls = JSON.stringify(metadata.sliceImageUrls || {});
  if (metadata.status !== undefined) updates.status = metadata.status;

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(col => `${col} = @${col}`).join(', ');
    db.prepare(`UPDATE tile_spans SET ${setClauses} WHERE id = @id`).run({ ...updates, id: spanId });
  }

  if (metadata.sliceImageUrls && typeof metadata.sliceImageUrls === 'object') {
    for (const [tileId, imageUrl] of Object.entries(metadata.sliceImageUrls)) {
      updateTileMetadata(Number(tileId), { imageUrl });
    }
  }

  return getTileSpan(spanId);
}

export function dissolveTileSpan(spanId, owner) {
  const db = getDb();
  const span = getTileSpan(spanId);
  if (!span) return null;
  if (owner && span.owner.toLowerCase() !== owner.toLowerCase()) {
    throw new Error('Unauthorized');
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE tiles SET span_id = NULL WHERE span_id = ?').run(spanId);
    db.prepare('DELETE FROM tile_spans WHERE id = ?').run(spanId);
  });
  tx();
  return span;
}

export function getGridState() {
  return {
    tiles: getAllTiles(),
    spans: getAllTileSpans(),
  };
}

// ─── Verification helpers ─────────────────────────────────────────────────────

/**
 * Store GitHub verification proof for a tile.
 */
export function setGithubVerification(id, githubUsername, gistId) {
  const db = getDb();
  const result = db.prepare(
    'UPDATE tiles SET github_verified = 1, github_username = ?, github_gist_id = ? WHERE id = ?'
  ).run(githubUsername, gistId, id);
  return result.changes > 0;
}

/**
 * Clear GitHub verification for a tile.
 */
export function clearGithubVerification(id) {
  const db = getDb();
  db.prepare(
    'UPDATE tiles SET github_verified = 0, github_username = NULL, github_gist_id = NULL WHERE id = ?'
  ).run(id);
}

/**
 * Store X/Twitter verification proof for a tile.
 */
export function setXVerification(id, xHandle, tweetUrl) {
  const db = getDb();
  const result = db.prepare(
    'UPDATE tiles SET x_verified = 1, x_handle_verified = ?, x_tweet_url = ? WHERE id = ?'
  ).run(xHandle, tweetUrl || null, id);
  return result.changes > 0;
}

/**
 * Clear X/Twitter verification for a tile.
 */
export function clearXVerification(id) {
  const db = getDb();
  db.prepare(
    'UPDATE tiles SET x_verified = 0, x_handle_verified = NULL, x_tweet_url = NULL WHERE id = ?'
  ).run(id);
}

// ─── Neighbor / Connection helpers ───────────────────────────────────────────

const MAX_CONNECTIONS_PER_TILE = 20;

/**
 * Add a connection between two tiles (from_id always < to_id for canonical form).
 * Returns { ok: true } or throws with a descriptive error.
 */
export function addConnection(idA, idB, label) {
  const db = getDb();
  const from_id = Math.min(idA, idB);
  const to_id = Math.max(idA, idB);

  // Wrap count check + insert in a transaction to prevent TOCTOU race condition.
  // Without this, two concurrent POSTs could both pass the limit check and both insert.
  const insertTx = db.transaction(() => {
    const countA = db.prepare(
      'SELECT COUNT(*) as n FROM tile_connections WHERE from_id = ? OR to_id = ?'
    ).get(idA, idA)?.n || 0;
    const countB = db.prepare(
      'SELECT COUNT(*) as n FROM tile_connections WHERE from_id = ? OR to_id = ?'
    ).get(idB, idB)?.n || 0;

    if (countA >= MAX_CONNECTIONS_PER_TILE || countB >= MAX_CONNECTIONS_PER_TILE) {
      throw new Error(`Max ${MAX_CONNECTIONS_PER_TILE} connections per tile`);
    }

    // Use plain INSERT (no OR IGNORE) — route already checks connectionExists().
    // If a duplicate somehow slips through, let the unique constraint throw rather than silently swallow it.
    const result = db.prepare(
      'INSERT INTO tile_connections (from_id, to_id, label) VALUES (?, ?, ?)'
    ).run(from_id, to_id, label || null);

    if (result.changes === 0) {
      throw new Error('Connection already exists');
    }
  });

  insertTx();
  return { ok: true, from_id, to_id };
}

/**
 * Remove a connection between two tiles.
 */
export function removeConnection(idA, idB) {
  const db = getDb();
  const from_id = Math.min(idA, idB);
  const to_id = Math.max(idA, idB);
  const result = db.prepare(
    'DELETE FROM tile_connections WHERE from_id = ? AND to_id = ?'
  ).run(from_id, to_id);
  return result.changes > 0;
}

/**
 * Get all neighbors of a tile (both directions).
 * Returns array of { neighborId, label, createdAt }.
 */
export function getNeighbors(id) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      CASE WHEN from_id = ? THEN to_id ELSE from_id END AS neighbor_id,
      label,
      created_at
    FROM tile_connections
    WHERE from_id = ? OR to_id = ?
  `).all(id, id, id);
  return rows.map(r => ({ neighborId: r.neighbor_id, label: r.label || null, createdAt: r.created_at }));
}

/**
 * Check if a connection exists between two tiles.
 */
export function connectionExists(idA, idB) {
  const db = getDb();
  const from_id = Math.min(idA, idB);
  const to_id = Math.max(idA, idB);
  const row = db.prepare(
    'SELECT 1 FROM tile_connections WHERE from_id = ? AND to_id = ?'
  ).get(from_id, to_id);
  return !!row;
}

/**
 * Get all connections in the DB (for rendering on the grid).
 * Returns array of { fromId, toId, label }.
 */
export function getAllConnections() {
  const db = getDb();
  return db.prepare('SELECT from_id, to_id, label FROM tile_connections').all()
    .map(r => ({ fromId: r.from_id, toId: r.to_id, label: r.label || null }));
}

// ─── Block tile helpers ───────────────────────────────────────────────────────

// Grid dimensions (matches frontend)
const GRID_SIZE = 256;

/**
 * Compute tile IDs for a block given top-left tile ID and block size.
 * Returns an array of IDs in row-major order, or null if out of bounds.
 */
export function getBlockTileIds(topLeftId, blockSize) {
  const col = topLeftId % GRID_SIZE;
  const row = Math.floor(topLeftId / GRID_SIZE);
  if (col + blockSize > GRID_SIZE || row + blockSize > GRID_SIZE) return null;
  const ids = [];
  for (let r = 0; r < blockSize; r++) {
    for (let c = 0; c < blockSize; c++) {
      ids.push((row + r) * GRID_SIZE + (col + c));
    }
  }
  return ids;
}

/**
 * Claim a block of tiles (2x2 or 3x3). All tiles must be unclaimed.
 * Returns { blockId, blockSize, topLeftId, tileIds, owner, claimedAt } or throws.
 */
export function claimBlock(topLeftId, blockSize, wallet) {
  const db = getDb();
  if (blockSize !== 2 && blockSize !== 3) throw new Error('block_size must be 2 or 3');

  const tileIds = getBlockTileIds(topLeftId, blockSize);
  if (!tileIds) throw new Error('Block extends outside grid boundaries');

  const claimBlockTx = db.transaction(() => {
    for (const id of tileIds) {
      const existing = db.prepare('SELECT id FROM tiles WHERE id = ?').get(id);
      if (existing) throw new Error(`Tile #${id} is already claimed`);
    }

    const now = new Date().toISOString();

    const blockInsert = db.prepare(`
      INSERT INTO tile_blocks (block_size, top_left_id, owner, status, claimed_at, tile_ids)
      VALUES (@block_size, @top_left_id, @owner, 'offline', @claimed_at, @tile_ids)
    `).run({
      block_size: blockSize,
      top_left_id: topLeftId,
      owner: wallet,
      claimed_at: now,
      tile_ids: JSON.stringify(tileIds),
    });

    const blockId = blockInsert.lastInsertRowid;

    for (let i = 0; i < tileIds.length; i++) {
      const id = tileIds[i];
      const price = getCurrentPrice();
      db.prepare(`
        INSERT INTO tiles (id, owner, name, status, claimed_at, price_paid, block_id)
        VALUES (@id, @owner, @name, 'offline', @claimed_at, @price_paid, @block_id)
      `).run({
        id,
        owner: wallet,
        name: i === 0 ? `Block #${topLeftId}` : null,
        claimed_at: now,
        price_paid: price,
        block_id: blockId,
      });
    }

    return {
      blockId: Number(blockId),
      blockSize,
      topLeftId,
      tileIds,
      owner: wallet,
      claimedAt: now,
    };
  });

  return claimBlockTx();
}

function blockRowToObj(r) {
  if (!r) return null;
  return {
    id: r.id,
    blockSize: r.block_size,
    topLeftId: r.top_left_id,
    owner: r.owner,
    name: r.name || `Block #${r.top_left_id}`,
    avatar: r.avatar || null,
    description: r.description || null,
    category: r.category || null,
    color: r.color || null,
    url: r.url || null,
    imageUrl: r.image_url || null,
    status: r.status || 'offline',
    lastHeartbeat: r.last_heartbeat || null,
    claimedAt: r.claimed_at,
    tileIds: JSON.parse(r.tile_ids),
  };
}

export function getAllBlocks() {
  const db = getDb();
  const hasStatus = hasColumn(db, 'tile_blocks', 'status');
  const rows = db.prepare('SELECT * FROM tile_blocks').all();
  return rows.map((row) => blockRowToObj(hasStatus ? row : { ...row, status: 'offline' }));
}

export function getBlock(blockId) {
  const db = getDb();
  const hasStatus = hasColumn(db, 'tile_blocks', 'status');
  const row = db.prepare('SELECT * FROM tile_blocks WHERE id = ?').get(blockId);
  return blockRowToObj(row && !hasStatus ? { ...row, status: 'offline' } : row);
}

export function updateBlockMetadata(blockId, metadata) {
  const db = getDb();
  const allowed = ['name', 'avatar', 'description', 'category', 'color', 'url', 'imageUrl'];
  const updates = {};
  for (const key of allowed) {
    if (metadata[key] !== undefined) {
      const colMap = { imageUrl: 'image_url' };
      updates[colMap[key] || key] = metadata[key];
    }
  }
  if (Object.keys(updates).length === 0) return getBlock(blockId);
  const setClauses = Object.keys(updates).map(col => `${col} = @${col}`).join(', ');
  db.prepare(`UPDATE tile_blocks SET ${setClauses} WHERE id = @id`).run({ ...updates, id: blockId });
  return getBlock(blockId);
}

// ─── Connection request helpers ──────────────────────────────────────────────

/**
 * Ensure connection_requests table exists (idempotent migration).
 */
function ensureConnectionRequestsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS connection_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_tile_id INTEGER NOT NULL,
      to_tile_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(from_tile_id, to_tile_id),
      CHECK(from_tile_id <> to_tile_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conn_req_to ON connection_requests(to_tile_id, status);
    CREATE INDEX IF NOT EXISTS idx_conn_req_from ON connection_requests(from_tile_id, status);
  `);
}

// Run migration immediately
ensureConnectionRequestsTable();

/**
 * Create a connection request from one tile to another.
 * Throws if a pending request already exists or tiles are already connected.
 */
export function createConnectionRequest(fromId, toId) {
  const db = getDb();
  // Check if already connected
  if (connectionExists(fromId, toId)) {
    throw new Error('Tiles are already connected');
  }
  // Check for existing pending request in either direction
  const existing = db.prepare(
    `SELECT id FROM connection_requests
     WHERE ((from_tile_id = ? AND to_tile_id = ?) OR (from_tile_id = ? AND to_tile_id = ?))
     AND status = 'pending'`
  ).get(fromId, toId, toId, fromId);
  if (existing) {
    throw new Error('A pending connection request already exists between these tiles');
  }
  const result = db.prepare(
    `INSERT INTO connection_requests (from_tile_id, to_tile_id, status) VALUES (?, ?, 'pending')`
  ).run(fromId, toId);
  return { id: Number(result.lastInsertRowid), fromTileId: fromId, toTileId: toId, status: 'pending' };
}

/**
 * Get all pending incoming requests for a tile (enriched with from_tile info).
 */
export function getPendingRequestsForTile(toId) {
  const db = getDb();
  return db.prepare(`
    SELECT cr.id, cr.from_tile_id, cr.to_tile_id, cr.status, cr.created_at,
           t.name, t.avatar, t.category, t.status as tile_status, t.image_url, t.color
    FROM connection_requests cr
    LEFT JOIN tiles t ON t.id = cr.from_tile_id
    WHERE cr.to_tile_id = ? AND cr.status = 'pending'
    ORDER BY cr.created_at DESC
  `).all(toId).map(r => ({
    id: r.id,
    fromTileId: r.from_tile_id,
    toTileId: r.to_tile_id,
    status: r.status,
    createdAt: r.created_at,
    fromTile: {
      id: r.from_tile_id,
      name: r.name || `Tile #${r.from_tile_id}`,
      avatar: r.avatar || null,
      category: r.category || null,
      status: r.tile_status || 'offline',
      imageUrl: r.image_url || null,
      color: r.color || null,
    },
  }));
}

/**
 * Get pending request counts keyed by to_tile_id (for grid badge rendering).
 */
export function getPendingRequestCounts() {
  const db = getDb();
  ensureConnectionRequestsTable(db);
  const rows = db.prepare(
    `SELECT to_tile_id, COUNT(*) as cnt FROM connection_requests WHERE status = 'pending' GROUP BY to_tile_id`
  ).all();
  const result = {};
  for (const r of rows) result[r.to_tile_id] = r.cnt;
  return result;
}

/**
 * Get all pending outgoing requests from a tile.
 */
export function getSentRequestsForTile(fromId) {
  const db = getDb();
  return db.prepare(`
    SELECT cr.id, cr.from_tile_id, cr.to_tile_id, cr.status, cr.created_at,
           t.name, t.avatar, t.category
    FROM connection_requests cr
    LEFT JOIN tiles t ON t.id = cr.to_tile_id
    WHERE cr.from_tile_id = ? AND cr.status = 'pending'
    ORDER BY cr.created_at DESC
  `).all(fromId).map(r => ({
    id: r.id,
    fromTileId: r.from_tile_id,
    toTileId: r.to_tile_id,
    status: r.status,
    createdAt: r.created_at,
    toTile: {
      id: r.to_tile_id,
      name: r.name || `Tile #${r.to_tile_id}`,
      avatar: r.avatar || null,
      category: r.category || null,
    },
  }));
}

/**
 * Get a single connection request by ID.
 */
export function getConnectionRequest(requestId) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM connection_requests WHERE id = ?').get(requestId);
  if (!r) return null;
  return {
    id: r.id,
    fromTileId: r.from_tile_id,
    toTileId: r.to_tile_id,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

/**
 * Accept a connection request. Validates that ownerTileId matches the to_tile_id.
 * Creates the actual connection and marks the request as accepted.
 */
export function acceptConnectionRequest(requestId, ownerTileId) {
  const db = getDb();
  const req = db.prepare('SELECT * FROM connection_requests WHERE id = ?').get(requestId);
  if (!req) throw new Error('Connection request not found');
  if (req.status !== 'pending') throw new Error('Request is no longer pending');
  if (req.to_tile_id !== ownerTileId) throw new Error('Not authorized to accept this request');

  const acceptTx = db.transaction(() => {
    // Create the actual connection
    addConnection(req.from_tile_id, req.to_tile_id, null);
    // Mark request as accepted
    db.prepare(
      `UPDATE connection_requests SET status = 'accepted', resolved_at = datetime('now') WHERE id = ?`
    ).run(requestId);
  });

  acceptTx();
  return { fromTileId: req.from_tile_id, toTileId: req.to_tile_id };
}

/**
 * Reject a connection request. Validates that ownerTileId matches the to_tile_id.
 */
export function rejectConnectionRequest(requestId, ownerTileId) {
  const db = getDb();
  const req = db.prepare('SELECT * FROM connection_requests WHERE id = ?').get(requestId);
  if (!req) throw new Error('Connection request not found');
  if (req.status !== 'pending') throw new Error('Request is no longer pending');
  if (req.to_tile_id !== ownerTileId) throw new Error('Not authorized to reject this request');

  db.prepare(
    `UPDATE connection_requests SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?`
  ).run(requestId);
  return { fromTileId: req.from_tile_id, toTileId: req.to_tile_id };
}

// ─── Activity feed helpers ────────────────────────────────────────────────────

// Close DB gracefully on process exit
process.on('exit', () => { if (_db) _db.close(); });
process.on('SIGINT', () => { if (_db) { _db.close(); process.exit(0); } });
process.on('SIGTERM', () => { if (_db) { _db.close(); process.exit(0); } });

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

/**
 * Get top tile holders with their tile names (most recently active tile).
 * Returns [{ owner, count, tiles: [{ id, name, avatar, category, status }] }]
 */
export function getTopHoldersWithTiles(limit = 20) {
  const db = getDb();
  const holders = db.prepare(
    `SELECT owner, COUNT(*) as count FROM tiles WHERE owner != '0x0000000000000000000000000000000000000000' GROUP BY owner ORDER BY count DESC LIMIT ?`
  ).all(limit);

  for (const h of holders) {
    const tiles = db.prepare(
      `SELECT id, name, avatar, category, status FROM tiles WHERE owner = ? ORDER BY claimed_at ASC LIMIT 5`
    ).all(h.owner);
    h.tiles = tiles;
  }
  return holders;
}

/**
 * Get count of online agents (heartbeat within TTL).
 */
export function getOnlineCount() {
  const db = getDb();
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM tiles WHERE status = 'online' AND last_heartbeat IS NOT NULL AND last_heartbeat >= ?`
  ).get(cutoff);
  return row.cnt;
}

/**
 * Get most recently active (heartbeat) agents.
 */
export function getRecentlyActive(limit = 10) {
  const db = getDb();
  return db.prepare(
    `SELECT id, name, avatar, category, owner, last_heartbeat, status FROM tiles WHERE last_heartbeat IS NOT NULL AND owner != '0x0000000000000000000000000000000000000000' ORDER BY last_heartbeat DESC LIMIT ?`
  ).all(limit);
}

/**
 * Get category breakdown.
 */
export function getCategoryBreakdown() {
  const db = getDb();
  return db.prepare(
    `SELECT COALESCE(category, 'uncategorized') as category, COUNT(*) as count FROM tiles GROUP BY category ORDER BY count DESC`
  ).all();
}

// ─── Webhook + view count helpers ────────────────────────────────────────────

/**
 * Migrate DB to add webhook and view tracking columns (idempotent).
 */
function ensureWebhookColumns() {
  const db = getDb();
  try { db.exec(`ALTER TABLE tiles ADD COLUMN webhook_url TEXT`); } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_views (
      tile_id    INTEGER NOT NULL,
      view_date  TEXT NOT NULL,        -- YYYY-MM-DD UTC
      view_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tile_id, view_date)
    );
    CREATE INDEX IF NOT EXISTS idx_tile_views_tile ON tile_views(tile_id);
  `);
}

// Run migration immediately (cheap, idempotent)
ensureWebhookColumns();

/**
 * Increment view count for a tile today, return today's count.
 */
export function incrementViewCount(tileId) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  db.prepare(`
    INSERT INTO tile_views (tile_id, view_date, view_count)
    VALUES (?, ?, 1)
    ON CONFLICT(tile_id, view_date) DO UPDATE SET view_count = view_count + 1
  `).run(tileId, today);
  const row = db.prepare(`SELECT view_count FROM tile_views WHERE tile_id = ? AND view_date = ?`).get(tileId, today);
  return row?.view_count || 1;
}

/**
 * Get today's view count for a tile.
 */
export function getViewCountToday(tileId) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare(`SELECT view_count FROM tile_views WHERE tile_id = ? AND view_date = ?`).get(tileId, today);
  return row?.view_count || 0;
}

/**
 * Get total (all-time) view count for a tile.
 */
export function getTotalViewCount(tileId) {
  const db = getDb();
  const row = db.prepare(`SELECT SUM(view_count) AS total FROM tile_views WHERE tile_id = ?`).get(tileId);
  return row?.total || 0;
}

/**
 * Get view counts for multiple tiles in one query (returns Map<tileId, total>).
 * Used for leaderboard / stats pages.
 */
export function getTotalViewCounts(tileIds) {
  if (!tileIds || tileIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = tileIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT tile_id, SUM(view_count) AS total FROM tile_views WHERE tile_id IN (${placeholders}) GROUP BY tile_id`
  ).all(...tileIds);
  return new Map(rows.map(r => [r.tile_id, r.total || 0]));
}

/**
 * Get top N most-viewed tiles (all time).
 */
export function getTopViewedTiles(limit = 20) {
  const db = getDb();
  return db.prepare(
    `SELECT tv.tile_id AS id, SUM(tv.view_count) AS totalViews,
            t.name, t.avatar, t.category, t.status, t.owner, t.image_url AS imageUrl
     FROM tile_views tv
     LEFT JOIN tiles t ON t.id = tv.tile_id
     GROUP BY tv.tile_id
     ORDER BY totalViews DESC
     LIMIT ?`
  ).all(limit);
}

/**
 * Get top tiles by reputation score.
 */
export function getTopByReputation(limit = 20) {
  const db = getDb();
  return db.prepare(
    `SELECT id, name, avatar, category, owner, status, rep_score AS repScore
     FROM tiles
     WHERE owner IS NOT NULL AND owner != '0x0000000000000000000000000000000000000000' AND rep_score > 0
     ORDER BY rep_score DESC
     LIMIT ?`
  ).all(limit);
}

/**
 * Get webhook URL for a tile (null if not set).
 */
export function getTileWebhookUrl(tileId) {
  const db = getDb();
  const row = db.prepare(`SELECT webhook_url FROM tiles WHERE id = ?`).get(tileId);
  return row?.webhook_url || null;
}

/**
 * Update webhook_url for a tile.
 */
export function updateTileWebhook(tileId, webhookUrl) {
  const db = getDb();
  const result = db.prepare(`UPDATE tiles SET webhook_url = ? WHERE id = ?`).run(webhookUrl || null, tileId);
  return result.changes > 0;
}

// ─── Events Log ───────────────────────────────────────────────────────────────

/**
 * Ensure events_log table exists (idempotent migration).
 * Called once at module load.
 */
function ensureEventsLog() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      tile_id    INTEGER,
      actor      TEXT,
      metadata   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_log_created ON events_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_log_tile ON events_log(tile_id);
  `);
}
ensureEventsLog();

/**
 * Append an event to the persistent events log.
 * @param {string} type - Event type (claimed, tile_image_updated, connection_accepted, metadata_updated)
 * @param {number|null} tileId - Primary tile involved
 * @param {string|null} actor - Wallet address of the actor (optional)
 * @param {object} meta - Additional metadata (serialized as JSON)
 */
export function logEvent(type, tileId = null, actor = null, meta = {}) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO events_log (type, tile_id, actor, metadata, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(type, tileId ?? null, actor ?? null, JSON.stringify(meta));
  } catch {
    // Non-fatal — events log is best-effort
  }
}

/**
 * Get recent activity events from events_log.
 * Falls back to tiles table (claimed events only) for history before events_log existed.
 * @param {number} limit - Max events to return
 * @returns {Array} events shaped for /api/activity
 */
export function getRecentActivity(limit = 50) {
  const db = getDb();

  // Check if events_log has any rows; if empty, seed from tiles table
  const logCount = db.prepare(`SELECT COUNT(*) as n FROM events_log`).get()?.n ?? 0;

  if (logCount === 0) {
    // No persisted events yet — return recent claims from tiles table
    const rows = db.prepare(
      `SELECT id, name, avatar, owner, claimed_at, status FROM tiles
       ORDER BY claimed_at DESC LIMIT ?`
    ).all(limit);
    return rows.map(row => ({
      type: 'claimed',
      tileId: row.id,
      tileName: row.name || `Tile #${row.id}`,
      tileAvatar: row.avatar || null,
      owner: row.owner,
      timestamp: row.claimed_at,
    }));
  }

  // Return from events_log, joining tile metadata
  const rows = db.prepare(`
    SELECT e.id as event_id, e.type, e.tile_id, e.actor, e.metadata, e.created_at,
           t.name as tile_name, t.avatar as tile_avatar, t.owner as tile_owner
    FROM events_log e
    LEFT JOIN tiles t ON t.id = e.tile_id
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(limit);

  return rows.map(row => {
    let meta = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch {}
    // Normalize SQLite datetime ("YYYY-MM-DD HH:MM:SS") to ISO 8601 so JS Date comparison works correctly
    const rawTs = row.created_at || '';
    const timestamp = rawTs.includes('T') ? rawTs : rawTs.replace(' ', 'T') + 'Z';
    // Map stored type aliases to canonical component type names
    const type = row.type === 'emote' ? 'tile_emote' : row.type;
    return {
      type,
      tileId: row.tile_id,
      tileName: meta.tileName || row.tile_name || (row.tile_id ? `Tile #${row.tile_id}` : 'Grid'),
      tileAvatar: meta.tileAvatar || row.tile_avatar || null,
      owner: row.actor || row.tile_owner || '',
      timestamp,
      meta,
    };
  });
}

// ─── Revenue Analytics helpers ────────────────────────────────────────────────

/**
 * Get daily claim counts and revenue for the last N days.
 * Returns array of { date: 'YYYY-MM-DD', claims: N, revenue: X }
 * sorted oldest→newest.
 */
export function getDailyStats(days = 30) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      substr(claimed_at, 1, 10) AS date,
      COUNT(*) AS claims,
      SUM(COALESCE(price_paid, 0)) AS revenue
    FROM tiles
    WHERE claimed_at >= date('now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(days);
  return rows.map(r => ({
    date: r.date,
    claims: r.claims,
    revenue: parseFloat((r.revenue || 0).toFixed(4)),
  }));
}

/**
 * Get count of unique claimers (distinct owner addresses, excluding null/zero addr).
 */
export function getUniqueClaimerCount() {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(DISTINCT owner) as cnt FROM tiles WHERE owner != '0x0000000000000000000000000000000000000000'`
  ).get();
  return row?.cnt ?? 0;
}

/**
 * Get daily unique claimer counts for the last N days.
 * Returns array of { date, uniqueClaimers }.
 */
export function getDailyUniqueClaimers(days = 30) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      substr(claimed_at, 1, 10) AS date,
      COUNT(DISTINCT owner) AS unique_claimers
    FROM tiles
    WHERE claimed_at >= date('now', '-' || ? || ' days')
      AND owner != '0x0000000000000000000000000000000000000000'
    GROUP BY date
    ORDER BY date ASC
  `).all(days);
  return rows.map(r => ({ date: r.date, uniqueClaimers: r.unique_claimers }));
}

/**
 * Compute average price per tile overall.
 */
export function getAveragePricePaid() {
  const db = getDb();
  const row = db.prepare(
    `SELECT AVG(price_paid) as avg FROM tiles WHERE price_paid IS NOT NULL AND price_paid > 0`
  ).get();
  return parseFloat((row?.avg || 0).toFixed(6));
}

/**
 * Get cumulative revenue over time (running total by day).
 * Returns array of { date, cumulativeRevenue }.
 */
export function getCumulativeRevenue(days = 30) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      substr(claimed_at, 1, 10) AS date,
      SUM(SUM(COALESCE(price_paid, 0))) OVER (ORDER BY substr(claimed_at, 1, 10)) AS cumulative_revenue
    FROM tiles
    WHERE claimed_at >= date('now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(days);
  return rows.map(r => ({
    date: r.date,
    cumulativeRevenue: parseFloat((r.cumulative_revenue || 0).toFixed(4)),
  }));
}

/**
 * Get revenue by category breakdown.
 * Returns array of { category, tiles, revenue }.
 */
export function getRevenueByCategory() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      COALESCE(category, 'uncategorized') AS category,
      COUNT(*) AS tiles,
      SUM(COALESCE(price_paid, 0)) AS revenue
    FROM tiles
    WHERE owner != '0x0000000000000000000000000000000000000000'
    GROUP BY category
    ORDER BY revenue DESC
  `).all();
  return rows.map(r => ({
    category: r.category,
    tiles: r.tiles,
    revenue: parseFloat((r.revenue || 0).toFixed(4)),
  }));
}

/**
 * Get all tiles that have no on-chain tx_hash (pending mints).
 * These are tiles where USDC was collected but the on-chain mint failed.
 */
export function getPendingMintTiles() {
  const db = getDb();
  return db.prepare(`
    SELECT id, owner, name, price_paid, claimed_at, sender_address
    FROM tiles
    WHERE tx_hash IS NULL OR tx_hash = ''
    ORDER BY claimed_at ASC
  `).all();
}

/**
 * Get all pending-mint tiles up to a limit.
 */
export function getPendingMintTilesLimit(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT id, owner, price_paid, claimed_at
    FROM tiles
    WHERE tx_hash IS NULL OR tx_hash = ''
    ORDER BY claimed_at ASC
    LIMIT ?
  `).all(limit);
}

// — Tile Notes / Guestbook —

function ensureNotesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tile_id    INTEGER NOT NULL,
      author     TEXT NOT NULL,
      author_tile INTEGER,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_tile ON tile_notes(tile_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created ON tile_notes(created_at DESC);
  `);
}
ensureNotesTable();

export function addNote(tileId, author, body, authorTile = null) {
  const db = getDb();
  const r = db.prepare(`INSERT INTO tile_notes (tile_id, author, author_tile, body) VALUES (?, ?, ?, ?)`).run(tileId, author, authorTile, body.slice(0, 500));
  return r.lastInsertRowid;
}

export function getNotes(tileId, limit = 50, offset = 0) {
  const db = getDb();
  return db.prepare(`SELECT id, tile_id, author, author_tile, body, created_at FROM tile_notes WHERE tile_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(tileId, limit, offset);
}

export function deleteNote(noteId, wallet) {
  const db = getDb();
  return db.prepare(`DELETE FROM tile_notes WHERE id = ? AND author = ?`).run(noteId, wallet);
}

// — Tile Actions (/slap, /praise, etc.) —

function ensureActionsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_tile   INTEGER NOT NULL,
      to_tile     INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      message     TEXT,
      actor       TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_actions_to ON tile_actions(to_tile);
    CREATE INDEX IF NOT EXISTS idx_actions_created ON tile_actions(created_at DESC);
  `);
}
ensureActionsTable();

const VALID_ACTIONS = ['slap', 'challenge', 'praise', 'wave', 'poke', 'taunt', 'hug', 'high-five'];

export function addAction(fromTile, toTile, actionType, actor, message = null) {
  if (!VALID_ACTIONS.includes(actionType)) return null;
  const db = getDb();
  const r = db.prepare(`INSERT INTO tile_actions (from_tile, to_tile, action_type, message, actor) VALUES (?, ?, ?, ?, ?)`).run(fromTile, toTile, actionType, message?.slice(0, 200) || null, actor);
  return r.lastInsertRowid;
}

export function getActions(tileId, limit = 20) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tile_actions WHERE from_tile = ? OR to_tile = ? ORDER BY created_at DESC LIMIT ?`).all(tileId, tileId, limit);
}

export function getRecentActions(limit = 30) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tile_actions ORDER BY created_at DESC LIMIT ?`).all(limit);
}

export { VALID_ACTIONS };

// — Direct Messages (encrypted tile-to-tile) —

function ensureMessagesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_tile     INTEGER NOT NULL,
      to_tile       INTEGER NOT NULL,
      sender        TEXT NOT NULL,
      encrypted_body TEXT NOT NULL,
      nonce         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      read_at       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_to ON tile_messages(to_tile);
    CREATE INDEX IF NOT EXISTS idx_messages_from ON tile_messages(from_tile);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON tile_messages(created_at DESC);
  `);
}
ensureMessagesTable();

export function sendMessage(fromTile, toTile, sender, encryptedBody, nonce) {
  const db = getDb();
  const r = db.prepare(`INSERT INTO tile_messages (from_tile, to_tile, sender, encrypted_body, nonce) VALUES (?, ?, ?, ?, ?)`).run(fromTile, toTile, sender, encryptedBody, nonce);
  return r.lastInsertRowid;
}

export function getMessages(tileId, limit = 50) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tile_messages WHERE from_tile = ? OR to_tile = ? ORDER BY created_at DESC LIMIT ?`).all(tileId, tileId, limit);
}

export function markMessageRead(messageId, wallet) {
  const db = getDb();
  return db.prepare(`UPDATE tile_messages SET read_at = datetime('now') WHERE id = ? AND to_tile IN (SELECT id FROM tiles WHERE owner = ?)`).run(messageId, wallet);
}

// — Tile Emotes / Reactions —

function ensureEmotesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_emotes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_tile  INTEGER NOT NULL,
      to_tile    INTEGER NOT NULL,
      emoji      TEXT NOT NULL,
      actor      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emotes_to ON tile_emotes(to_tile);
    CREATE INDEX IF NOT EXISTS idx_emotes_created ON tile_emotes(created_at DESC);
  `);
}
ensureEmotesTable();

const ALLOWED_EMOTES = ['👍', '❤️', '🔥', '😂', '🤔', '👏', '🙌', '💀', '🎉', '⚔️', '🐟', '👀', '🫡', '💪', '🤝'];

export function addEmote(fromTile, toTile, emoji, actor) {
  if (!ALLOWED_EMOTES.includes(emoji)) return null;
  const db = getDb();
  const r = db.prepare(`INSERT INTO tile_emotes (from_tile, to_tile, emoji, actor) VALUES (?, ?, ?, ?)`).run(fromTile, toTile, emoji, actor);
  return r.lastInsertRowid;
}

export function getEmotes(tileId, limit = 30) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tile_emotes WHERE to_tile = ? ORDER BY created_at DESC LIMIT ?`).all(tileId, limit);
}

export function getRecentEmotes(limit = 50) {
  const db = getDb();
  return db.prepare(`SELECT * FROM tile_emotes ORDER BY created_at DESC LIMIT ?`).all(limit);
}

// — Engagement Analytics Queries —

export function getEngagementSummary() {
  const db = getDb();
  const actions = db.prepare('SELECT COUNT(*) as n FROM tile_actions').get().n;
  const notes = db.prepare('SELECT COUNT(*) as n FROM tile_notes').get().n;
  const emotes = db.prepare('SELECT COUNT(*) as n FROM tile_emotes').get().n;
  const messages = db.prepare('SELECT COUNT(*) as n FROM tile_messages').get().n;
  const connections = db.prepare('SELECT COUNT(*) as n FROM tile_connections').get().n;
  const pendingConnections = db.prepare("SELECT COUNT(*) as n FROM connection_requests WHERE status = 'pending'").get().n;
  const onlineTiles = db.prepare("SELECT COUNT(*) as n FROM tiles WHERE status = 'online'").get().n;
  const heartbeatEver = db.prepare('SELECT COUNT(*) as n FROM tiles WHERE last_heartbeat IS NOT NULL').get().n;
  return { actions, notes, emotes, messages, connections, pendingConnections, onlineTiles, heartbeatEver };
}

export function getActionBreakdown() {
  const db = getDb();
  return db.prepare(`
    SELECT action_type, COUNT(*) as count
    FROM tile_actions
    GROUP BY action_type
    ORDER BY count DESC
  `).all();
}

export function getEmoteBreakdown() {
  const db = getDb();
  return db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM tile_emotes
    GROUP BY emoji
    ORDER BY count DESC
  `).all();
}

export function getDailyEngagement(days = 30) {
  const db = getDb();
  return db.prepare(`
    SELECT date, SUM(actions) as actions, SUM(notes) as notes, SUM(emotes) as emotes, SUM(messages) as messages
    FROM (
      SELECT DATE(created_at) as date, COUNT(*) as actions, 0 as notes, 0 as emotes, 0 as messages FROM tile_actions WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at)
      UNION ALL
      SELECT DATE(created_at) as date, 0, COUNT(*), 0, 0 FROM tile_notes WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at)
      UNION ALL
      SELECT DATE(created_at) as date, 0, 0, COUNT(*), 0 FROM tile_emotes WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at)
      UNION ALL
      SELECT DATE(created_at) as date, 0, 0, 0, COUNT(*) FROM tile_messages WHERE created_at >= DATE('now', '-' || ? || ' days') GROUP BY DATE(created_at)
    ) combined
    GROUP BY date
    ORDER BY date ASC
  `).all(days, days, days, days);
}

export function getMostActiveAgents(limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT t.id, t.name, t.avatar, t.image_url, t.category,
      (SELECT COUNT(*) FROM tile_actions WHERE from_tile = t.id) as actionsSent,
      (SELECT COUNT(*) FROM tile_actions WHERE to_tile = t.id) as actionsReceived,
      (SELECT COUNT(*) FROM tile_notes WHERE author_tile = t.id) as notesLeft,
      (SELECT COUNT(*) FROM tile_emotes WHERE from_tile = t.id) as emotesSent,
      (SELECT COUNT(*) FROM tile_messages WHERE from_tile = t.id) as messagesSent,
      (SELECT COUNT(*) FROM tile_connections WHERE from_id = t.id OR to_id = t.id) as connections
    FROM tiles t
    ORDER BY (actionsSent + actionsReceived + notesLeft + emotesSent + messagesSent) DESC
    LIMIT ?
  `).all(limit);
}

export function getMostSlappedAgents(limit = 5) {
  const db = getDb();
  return db.prepare(`
    SELECT t.id, t.name, t.avatar, t.image_url, COUNT(*) as slapCount
    FROM tile_actions a
    JOIN tiles t ON t.id = a.to_tile
    WHERE a.action_type = 'slap'
    GROUP BY a.to_tile
    ORDER BY slapCount DESC
    LIMIT ?
  `).all(limit);
}

export function getConnectionStats() {
  const db = getDb();
  const accepted = db.prepare('SELECT COUNT(*) as n FROM tile_connections').get().n; // tile_connections = accepted connections
  const pending = db.prepare("SELECT COUNT(*) as n FROM connection_requests WHERE status = 'pending'").get().n;
  const rejected = db.prepare("SELECT COUNT(*) as n FROM connection_requests WHERE status = 'rejected'").get().n;
  return { accepted, pending, rejected };
}

export function getHeartbeatStats() {
  const db = getDb();
  const online = db.prepare("SELECT COUNT(*) as n FROM tiles WHERE status = 'online'").get().n;
  const total = db.prepare('SELECT COUNT(*) as n FROM tiles').get().n;
  const everPinged = db.prepare('SELECT COUNT(*) as n FROM tiles WHERE last_heartbeat IS NOT NULL').get().n;
  const lastHour = db.prepare('SELECT COUNT(*) as n FROM tiles WHERE last_heartbeat > ?').get(Date.now() - 3600000).n;
  return { online, total, everPinged, lastHour };
}

/**
 * Compute a reputation score for a tile based on objective activity metrics.
 *
 * Score components (max 100 total):
 *   - Heartbeat recency: up to 20 pts. Online now = 20, last 24h = 15, last week = 8, last month = 3, never = 0
 *   - Connections: up to 20 pts. 1pt per accepted connection, cap 20
 *   - Notes received: up to 15 pts. 3pt per note, cap 15
 *   - Actions performed (emotes + slaps + waves etc): up to 15 pts. 1pt per action sent, cap 15
 *   - Age bonus: up to 10 pts. Days since claim / 30, cap 10
 *   - Verified identity: up to 10 pts. GitHub verified = 5, X verified = 5
 *   - Has profile (name + description + image): up to 10 pts. Each filled field = ~3.33
 */
export function computeRepScore(tileId) {
  const db = getDb();
  const tile = db.prepare('SELECT * FROM tiles WHERE id = ?').get(tileId);
  if (!tile) return { total: 0, breakdown: { heartbeat: 0, connections: 0, notes: 0, actions: 0, age: 0, identity: 0, profile: 0 } };

  const breakdown = { heartbeat: 0, connections: 0, notes: 0, actions: 0, age: 0, identity: 0, profile: 0 };

  // Heartbeat recency (max 20)
  if (tile.last_heartbeat) {
    const ageSec = (Date.now() - tile.last_heartbeat) / 1000;
    if (ageSec < 300) breakdown.heartbeat = 20;          // online now (within 5 min)
    else if (ageSec < 86400) breakdown.heartbeat = 15;   // last 24h
    else if (ageSec < 604800) breakdown.heartbeat = 8;   // last week
    else if (ageSec < 2592000) breakdown.heartbeat = 3;  // last month
  }

  // Connections (max 20)
  const connCount = db.prepare(
    'SELECT COUNT(*) as n FROM tile_connections WHERE from_id = ? OR to_id = ?'
  ).get(tileId, tileId).n;
  breakdown.connections = Math.min(connCount, 20);

  // Notes received (max 15)
  const noteCount = db.prepare(
    'SELECT COUNT(*) as n FROM tile_notes WHERE tile_id = ?'
  ).get(tileId).n;
  breakdown.notes = Math.min(noteCount * 3, 15);

  // Actions performed — emotes sent + actions from this tile (max 15)
  const actionCount = db.prepare(
    'SELECT COUNT(*) as n FROM tile_actions WHERE from_tile = ?'
  ).get(tileId).n;
  const emoteCount = db.prepare(
    'SELECT COUNT(*) as n FROM tile_emotes WHERE from_tile = ?'
  ).get(tileId).n;
  breakdown.actions = Math.min(actionCount + emoteCount, 15);

  // Age bonus (max 10)
  if (tile.claimed_at) {
    const ageMs = Date.now() - new Date(tile.claimed_at).getTime();
    const ageDays = ageMs / 86400000;
    breakdown.age = Math.min(Math.floor(ageDays / 3), 10); // 1 pt per 3 days, cap 10
  }

  // Verified identity (max 10)
  if (tile.github_verified === 1) breakdown.identity += 5;
  if (tile.x_verified === 1) breakdown.identity += 5;

  // Has profile data (max 10)
  const hasName = tile.name && !tile.name.startsWith('Tile #');
  const hasDesc = !!tile.description;
  const hasImage = !!tile.image_url;
  if (hasName) breakdown.profile += Math.round(10 / 3);
  if (hasDesc) breakdown.profile += Math.round(10 / 3);
  if (hasImage) breakdown.profile += Math.round(10 / 3);

  const total = Math.min(
    Math.round(
      breakdown.heartbeat + breakdown.connections + breakdown.notes +
      breakdown.actions + breakdown.age + breakdown.identity + breakdown.profile
    ),
    100
  );

  return { total, breakdown };
}

/**
 * Compute and persist rep scores for all claimed tiles.
 * Returns { updated: N, skipped: 0 }
 */
export function refreshAllRepScores() {
  const db = getDb();
  const tiles = db.prepare('SELECT id FROM tiles').all();
  const updateStmt = db.prepare('UPDATE tiles SET rep_score = ? WHERE id = ?');
  const updateAll = db.transaction(() => {
    let updated = 0;
    for (const { id } of tiles) {
      const { total: score } = computeRepScore(id);
      updateStmt.run(score, id);
      updated++;
    }
    return updated;
  });
  const updated = updateAll();
  return { updated };
}

export { ALLOWED_EMOTES };

// — Tile Challenges / Duels ————————————————————————————————————————————

function ensureChallengesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_challenges (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger_id    INTEGER NOT NULL,
      defender_id      INTEGER NOT NULL,
      challenger_wallet TEXT NOT NULL,
      defender_wallet  TEXT,
      task_type        TEXT NOT NULL DEFAULT 'general',
      message          TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      challenger_score REAL,
      defender_score   REAL,
      winner_id        INTEGER,
      expires_at       TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON tile_challenges(challenger_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_defender ON tile_challenges(defender_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_status ON tile_challenges(status);
    CREATE INDEX IF NOT EXISTS idx_challenges_created ON tile_challenges(created_at DESC);
  `);
  // Add trophy_expires_at column to tiles if not present
  try { db.exec(`ALTER TABLE tiles ADD COLUMN trophy_expires_at TEXT`); } catch {}
}
ensureChallengesTable();

export const VALID_TASK_TYPES = ['general', 'code_quality', 'trivia', 'market_prediction', 'speed', 'creativity'];
export const CHALLENGE_EXPIRE_HOURS = 24;

export function issueChallenge(challengerId, defenderId, challengerWallet, taskType = 'general', message = null) {
  if (!VALID_TASK_TYPES.includes(taskType)) throw new Error(`Invalid task type: ${taskType}`);
  const db = getDb();

  const challenger = db.prepare('SELECT id, name, owner FROM tiles WHERE id = ?').get(challengerId);
  const defender = db.prepare('SELECT id, name, owner FROM tiles WHERE id = ?').get(defenderId);
  if (!challenger) throw new Error('Challenger tile not found');
  if (!defender) throw new Error('Defender tile not found');
  if (!defender.owner) throw new Error('Defender tile is not claimed');
  if (challengerId === defenderId) throw new Error('Cannot challenge yourself');
  if (challenger.owner?.toLowerCase() !== challengerWallet?.toLowerCase()) throw new Error('Not the owner of challenger tile');

  // Only one active challenge between the same pair at a time
  const existing = db.prepare(
    `SELECT id FROM tile_challenges WHERE status IN ('pending','active') AND ((challenger_id = ? AND defender_id = ?) OR (challenger_id = ? AND defender_id = ?)) LIMIT 1`
  ).get(challengerId, defenderId, defenderId, challengerId);
  if (existing) throw new Error('A challenge between these tiles is already active');

  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRE_HOURS * 3600 * 1000).toISOString();
  const r = db.prepare(
    `INSERT INTO tile_challenges (challenger_id, defender_id, challenger_wallet, task_type, message, status, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`
  ).run(challengerId, defenderId, challengerWallet, taskType, message?.slice(0, 200) || null, expiresAt);
  return r.lastInsertRowid;
}

export function acceptChallenge(challengeId, defenderWallet) {
  const db = getDb();
  const ch = db.prepare('SELECT * FROM tile_challenges WHERE id = ?').get(challengeId);
  if (!ch) throw new Error('Challenge not found');
  if (ch.status !== 'pending') throw new Error(`Challenge is ${ch.status}`);
  if (new Date(ch.expires_at) < new Date()) throw new Error('Challenge has expired');

  const defender = db.prepare('SELECT owner FROM tiles WHERE id = ?').get(ch.defender_id);
  if (defender?.owner?.toLowerCase() !== defenderWallet?.toLowerCase()) throw new Error('Not the defender tile owner');

  db.prepare(`UPDATE tile_challenges SET status = 'active', defender_wallet = ? WHERE id = ?`).run(defenderWallet, challengeId);
  return db.prepare('SELECT * FROM tile_challenges WHERE id = ?').get(challengeId);
}

export function submitChallengeScore(challengeId, tileId, wallet, score) {
  if (typeof score !== 'number' || score < 0 || score > 100) throw new Error('Score must be 0-100');
  const db = getDb();
  const ch = db.prepare('SELECT * FROM tile_challenges WHERE id = ?').get(challengeId);
  if (!ch) throw new Error('Challenge not found');
  if (ch.status !== 'active') throw new Error(`Challenge is not active (status: ${ch.status})`);
  if (new Date(ch.expires_at) < new Date()) throw new Error('Challenge has expired');

  const tile = db.prepare('SELECT owner FROM tiles WHERE id = ?').get(tileId);
  if (tile?.owner?.toLowerCase() !== wallet?.toLowerCase()) throw new Error('Not the tile owner');

  const isChallenger = tileId === ch.challenger_id;
  const isDefender = tileId === ch.defender_id;
  if (!isChallenger && !isDefender) throw new Error('Tile is not a participant in this challenge');

  // Update score for this participant
  if (isChallenger) {
    db.prepare('UPDATE tile_challenges SET challenger_score = ? WHERE id = ?').run(score, challengeId);
  } else {
    db.prepare('UPDATE tile_challenges SET defender_score = ? WHERE id = ?').run(score, challengeId);
  }

  // Reload and check if both scores are in
  const updated = db.prepare('SELECT * FROM tile_challenges WHERE id = ?').get(challengeId);
  if (updated.challenger_score != null && updated.defender_score != null) {
    // Determine winner
    let winnerId = null;
    if (updated.challenger_score > updated.defender_score) winnerId = updated.challenger_id;
    else if (updated.defender_score > updated.challenger_score) winnerId = updated.defender_id;
    // Tie = no winner
    db.prepare('UPDATE tile_challenges SET status = ?, winner_id = ? WHERE id = ?').run('completed', winnerId, challengeId);
    // Award trophy to winner for 24h
    if (winnerId != null) {
      const trophyExpires = new Date(Date.now() + CHALLENGE_EXPIRE_HOURS * 3600 * 1000).toISOString();
      db.prepare('UPDATE tiles SET trophy_expires_at = ? WHERE id = ?').run(trophyExpires, winnerId);
    }
    return db.prepare('SELECT * FROM tile_challenges WHERE id = ?').get(challengeId);
  }
  return updated;
}

export function getTileChallenges(tileId, limit = 20) {
  const db = getDb();
  // Expire pending challenges
  db.prepare(`UPDATE tile_challenges SET status = 'expired' WHERE status IN ('pending','active') AND expires_at < datetime('now')`).run();
  return db.prepare(
    `SELECT ch.*,
       ct.name AS challenger_name, ct.avatar AS challenger_avatar,
       dt.name AS defender_name, dt.avatar AS defender_avatar,
       wt.name AS winner_name
     FROM tile_challenges ch
     LEFT JOIN tiles ct ON ct.id = ch.challenger_id
     LEFT JOIN tiles dt ON dt.id = ch.defender_id
     LEFT JOIN tiles wt ON wt.id = ch.winner_id
     WHERE ch.challenger_id = ? OR ch.defender_id = ?
     ORDER BY ch.created_at DESC LIMIT ?`
  ).all(tileId, tileId, limit);
}

export function getChallenge(challengeId) {
  const db = getDb();
  return db.prepare(
    `SELECT ch.*,
       ct.name AS challenger_name, ct.avatar AS challenger_avatar,
       dt.name AS defender_name, dt.avatar AS defender_avatar,
       wt.name AS winner_name
     FROM tile_challenges ch
     LEFT JOIN tiles ct ON ct.id = ch.challenger_id
     LEFT JOIN tiles dt ON dt.id = ch.defender_id
     LEFT JOIN tiles wt ON wt.id = ch.winner_id
     WHERE ch.id = ?`
  ).get(challengeId);
}

export function getChallengersLeaderboard(limit = 20) {
  const db = getDb();
  return db.prepare(
    `SELECT t.id, t.name, t.avatar, t.category, COUNT(ch.id) AS wins
     FROM tiles t
     JOIN tile_challenges ch ON ch.winner_id = t.id
     WHERE ch.status = 'completed'
     GROUP BY t.id
     ORDER BY wins DESC
     LIMIT ?`
  ).all(limit);
}

export function hasTrophy(tileId) {
  const db = getDb();
  const tile = db.prepare('SELECT trophy_expires_at FROM tiles WHERE id = ?').get(tileId);
  if (!tile?.trophy_expires_at) return false;
  return new Date(tile.trophy_expires_at) > new Date();
}

// — Territory Alliances ————————————————————————————————————————————

function ensureAllianceTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_alliances (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color           TEXT NOT NULL,
      founder_tile_id INTEGER NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id INTEGER NOT NULL REFERENCES tile_alliances(id) ON DELETE CASCADE,
      tile_id     INTEGER NOT NULL UNIQUE,
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (alliance_id, tile_id)
    );
    CREATE INDEX IF NOT EXISTS idx_alliance_members_tile ON alliance_members(tile_id);
    CREATE INDEX IF NOT EXISTS idx_alliance_members_alliance ON alliance_members(alliance_id);
  `);
}
ensureAllianceTables();

const GRID = 256;

function areAdjacent(id1, id2) {
  const x1 = id1 % GRID, y1 = Math.floor(id1 / GRID);
  const x2 = id2 % GRID, y2 = Math.floor(id2 / GRID);
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
}

export function createAlliance(name, color, founderTileId, wallet) {
  const db = getDb();
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(founderTileId);
  if (!tile) throw new Error('Tile not found');
  if (!tile.owner) throw new Error('Tile is not claimed');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');

  const existing = db.prepare('SELECT alliance_id FROM alliance_members WHERE tile_id = ?').get(founderTileId);
  if (existing) throw new Error('Tile is already in an alliance');

  if (!name || name.length < 2 || name.length > 32) throw new Error('Alliance name must be 2-32 characters');
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Color must be a hex color like #FF5500');

  const tx = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO tile_alliances (name, color, founder_tile_id) VALUES (?, ?, ?)'
    ).run(name, color, founderTileId);
    const allianceId = Number(result.lastInsertRowid);
    db.prepare(
      'INSERT INTO alliance_members (alliance_id, tile_id) VALUES (?, ?)'
    ).run(allianceId, founderTileId);
    return allianceId;
  });
  const allianceId = tx();
  return getAlliance(allianceId);
}

export function joinAlliance(allianceId, tileId, wallet) {
  const db = getDb();
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(tileId);
  if (!tile) throw new Error('Tile not found');
  if (!tile.owner) throw new Error('Tile is not claimed');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');

  const existing = db.prepare('SELECT alliance_id FROM alliance_members WHERE tile_id = ?').get(tileId);
  if (existing) throw new Error('Tile is already in an alliance');

  const alliance = db.prepare('SELECT id FROM tile_alliances WHERE id = ?').get(allianceId);
  if (!alliance) throw new Error('Alliance not found');

  const members = db.prepare('SELECT tile_id FROM alliance_members WHERE alliance_id = ?').all(allianceId);
  const isAdjacentToAny = members.some(m => areAdjacent(m.tile_id, tileId));
  if (!isAdjacentToAny) throw new Error('Tile must be adjacent to at least one alliance member');

  db.prepare('INSERT INTO alliance_members (alliance_id, tile_id) VALUES (?, ?)').run(allianceId, tileId);
  return getAlliance(allianceId);
}

export function leaveAlliance(allianceId, tileId, wallet) {
  const db = getDb();
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(tileId);
  if (!tile) throw new Error('Tile not found');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');

  const result = db.prepare('DELETE FROM alliance_members WHERE alliance_id = ? AND tile_id = ?').run(allianceId, tileId);
  if (result.changes === 0) throw new Error('Tile is not a member of this alliance');

  const remaining = db.prepare('SELECT COUNT(*) as n FROM alliance_members WHERE alliance_id = ?').get(allianceId);
  if (remaining.n === 0) {
    db.prepare('DELETE FROM tile_alliances WHERE id = ?').run(allianceId);
    return null;
  }
  return getAlliance(allianceId);
}

export function getAlliance(allianceId) {
  const db = getDb();
  const alliance = db.prepare('SELECT * FROM tile_alliances WHERE id = ?').get(allianceId);
  if (!alliance) return null;
  const members = db.prepare(
    `SELECT am.tile_id, am.joined_at, t.name, t.avatar, t.owner
     FROM alliance_members am
     JOIN tiles t ON t.id = am.tile_id
     WHERE am.alliance_id = ?
     ORDER BY am.joined_at ASC`
  ).all(allianceId);
  return { ...alliance, members, member_count: members.length };
}

export function getAlliances(limit = 50) {
  const db = getDb();
  return db.prepare(
    `SELECT a.id, a.name, a.color, a.founder_tile_id, a.created_at,
            COUNT(m.tile_id) as member_count
     FROM tile_alliances a
     LEFT JOIN alliance_members m ON m.alliance_id = a.id
     GROUP BY a.id
     ORDER BY member_count DESC
     LIMIT ?`
  ).all(limit);
}

export function getTileAlliance(tileId) {
  const db = getDb();
  const membership = db.prepare(
    `SELECT a.*, am.joined_at,
            (SELECT COUNT(*) FROM alliance_members WHERE alliance_id = a.id) as member_count
     FROM alliance_members am
     JOIN tile_alliances a ON a.id = am.alliance_id
     WHERE am.tile_id = ?`
  ).get(tileId);
  return membership || null;
}

export function getAllianceTileIds(allianceId) {
  const db = getDb();
  return db.prepare('SELECT tile_id FROM alliance_members WHERE alliance_id = ?')
    .all(allianceId).map(r => r.tile_id);
}

export function getAllAllianceTileMap() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT am.tile_id, a.id as alliance_id, a.color
     FROM alliance_members am
     JOIN tile_alliances a ON a.id = am.alliance_id`
  ).all();
  const map = {};
  for (const r of rows) {
    map[r.tile_id] = { alliance_id: r.alliance_id, color: r.color };
  }
  return map;
}

// — Bounty Board ——————————————————————————————————————————————————————

function ensureBountyTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tile_bounties (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tile_id         INTEGER NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      reward_usdc     REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'open',
      winner_tile_id  INTEGER,
      expires_at      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tile_bounties_tile ON tile_bounties(tile_id);
    CREATE INDEX IF NOT EXISTS idx_tile_bounties_status ON tile_bounties(status);

    CREATE TABLE IF NOT EXISTS bounty_submissions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      bounty_id         INTEGER NOT NULL REFERENCES tile_bounties(id) ON DELETE CASCADE,
      submitter_tile_id INTEGER NOT NULL,
      answer_text       TEXT,
      url               TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bounty_submissions_bounty ON bounty_submissions(bounty_id);
  `);
}
ensureBountyTables();

export function createBounty(tileId, { title, description, reward_usdc, expires_at, wallet }) {
  const db = getDb();
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(tileId);
  if (!tile) throw new Error('Tile not found');
  if (!tile.owner) throw new Error('Tile is not claimed');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');
  if (!title || title.length < 3 || title.length > 100) throw new Error('Title must be 3-100 characters');
  const reward = parseFloat(reward_usdc) || 0;
  if (reward < 0) throw new Error('Reward must be non-negative');

  const result = db.prepare(
    `INSERT INTO tile_bounties (tile_id, title, description, reward_usdc, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tileId, title, description || null, reward, expires_at || null);
  return getBounty(Number(result.lastInsertRowid));
}

export function getBounty(bountyId) {
  const db = getDb();
  const bounty = db.prepare('SELECT * FROM tile_bounties WHERE id = ?').get(bountyId);
  if (!bounty) return null;
  const submissions = db.prepare(
    `SELECT bs.*, t.name as submitter_name, t.avatar as submitter_avatar
     FROM bounty_submissions bs
     LEFT JOIN tiles t ON t.id = bs.submitter_tile_id
     WHERE bs.bounty_id = ? ORDER BY bs.created_at ASC`
  ).all(bountyId);
  return { ...bounty, submissions, submission_count: submissions.length };
}

export function getTileBounties(tileId, { status } = {}) {
  const db = getDb();
  // Auto-expire overdue bounties
  db.prepare(
    `UPDATE tile_bounties SET status = 'expired'
     WHERE tile_id = ? AND status = 'open' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  ).run(tileId);

  let query = 'SELECT * FROM tile_bounties WHERE tile_id = ?';
  const args = [tileId];
  if (status) { query += ' AND status = ?'; args.push(status); }
  query += ' ORDER BY created_at DESC';
  const bounties = db.prepare(query).all(...args);
  return bounties.map(b => ({
    ...b,
    submission_count: db.prepare('SELECT COUNT(*) as n FROM bounty_submissions WHERE bounty_id = ?').get(b.id).n,
  }));
}

export function getGlobalBounties({ status = 'open', limit = 50 } = {}) {
  const db = getDb();
  // Auto-expire globally
  db.prepare(
    `UPDATE tile_bounties SET status = 'expired'
     WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < datetime('now')`
  ).run();

  return db.prepare(
    `SELECT b.*, t.name as tile_name, t.avatar as tile_avatar, t.owner as tile_owner,
            (SELECT COUNT(*) FROM bounty_submissions WHERE bounty_id = b.id) as submission_count
     FROM tile_bounties b
     LEFT JOIN tiles t ON t.id = b.tile_id
     WHERE b.status = ?
     ORDER BY b.reward_usdc DESC, b.created_at DESC
     LIMIT ?`
  ).all(status, limit);
}

export function claimBounty(bountyId, submitterTileId, wallet) {
  // "claiming" = expressing intent + first submission placeholder
  const db = getDb();
  const bounty = db.prepare('SELECT * FROM tile_bounties WHERE id = ?').get(bountyId);
  if (!bounty) throw new Error('Bounty not found');
  if (bounty.status !== 'open') throw new Error(`Bounty is ${bounty.status}`);
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(submitterTileId);
  if (!tile || !tile.owner) throw new Error('Submitter tile not claimed');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');
  if (bounty.tile_id === submitterTileId) throw new Error('Cannot claim your own bounty');
  const existing = db.prepare('SELECT id FROM bounty_submissions WHERE bounty_id = ? AND submitter_tile_id = ?').get(bountyId, submitterTileId);
  if (existing) throw new Error('Already claimed/submitted');
  db.prepare('INSERT INTO bounty_submissions (bounty_id, submitter_tile_id) VALUES (?, ?)').run(bountyId, submitterTileId);
  return getBounty(bountyId);
}

export function submitBountyAnswer(bountyId, submitterTileId, { answer_text, url, wallet }) {
  const db = getDb();
  const bounty = db.prepare('SELECT * FROM tile_bounties WHERE id = ?').get(bountyId);
  if (!bounty) throw new Error('Bounty not found');
  if (bounty.status !== 'open') throw new Error(`Bounty is ${bounty.status}`);
  const tile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(submitterTileId);
  if (!tile || !tile.owner) throw new Error('Submitter tile not claimed');
  if (tile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of this tile');
  if (bounty.tile_id === submitterTileId) throw new Error('Cannot submit to your own bounty');

  const existing = db.prepare('SELECT id FROM bounty_submissions WHERE bounty_id = ? AND submitter_tile_id = ?').get(bountyId, submitterTileId);
  if (existing) {
    db.prepare('UPDATE bounty_submissions SET answer_text = ?, url = ? WHERE id = ?').run(answer_text || null, url || null, existing.id);
  } else {
    db.prepare('INSERT INTO bounty_submissions (bounty_id, submitter_tile_id, answer_text, url) VALUES (?, ?, ?, ?)').run(bountyId, submitterTileId, answer_text || null, url || null);
  }
  return getBounty(bountyId);
}

export function awardBounty(bountyId, winnerTileId, wallet) {
  const db = getDb();
  const bounty = db.prepare('SELECT * FROM tile_bounties WHERE id = ?').get(bountyId);
  if (!bounty) throw new Error('Bounty not found');
  if (bounty.status !== 'open') throw new Error(`Bounty is ${bounty.status}`);
  const ownerTile = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(bounty.tile_id);
  if (!ownerTile || ownerTile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Only the tile owner can award');
  const winnerExists = db.prepare('SELECT id FROM bounty_submissions WHERE bounty_id = ? AND submitter_tile_id = ?').get(bountyId, winnerTileId);
  if (!winnerExists) throw new Error('Winner tile has no submission');

  db.prepare('UPDATE tile_bounties SET status = ?, winner_tile_id = ? WHERE id = ?').run('awarded', winnerTileId, bountyId);
  return getBounty(bountyId);
}

export function getTilesWithOpenBounties() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT tile_id, COUNT(*) as count FROM tile_bounties WHERE status = 'open' GROUP BY tile_id`
  ).all();
  const map = {};
  for (const r of rows) map[r.tile_id] = r.count;
  return map;
}

// — Pixel Wars ——————————————————————————————————————————————————————
// r/place-style mini-game: tile owners color adjacent unclaimed tiles.
// Paints expire after 1 hour. Each wallet can paint max 5 tiles/hour.
// A 24h round tracks coverage; round winner earns "Pixel Champion" badge.

const PIXEL_WARS_RATE_LIMIT = 5;       // max paints per wallet per hour
const PIXEL_WARS_PAINT_TTL_HOURS = 1;  // paint expires after 1 hour
const PIXEL_WARS_ROUND_HOURS = 24;     // round duration

function ensurePixelWarsTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pixel_wars_paints (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tile_id    INTEGER NOT NULL UNIQUE,
      owner      TEXT NOT NULL,
      owner_tile INTEGER NOT NULL,
      color      TEXT NOT NULL,
      painted_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pw_tile    ON pixel_wars_paints(tile_id);
    CREATE INDEX IF NOT EXISTS idx_pw_owner   ON pixel_wars_paints(owner);
    CREATE INDEX IF NOT EXISTS idx_pw_expires ON pixel_wars_paints(expires_at);

    CREATE TABLE IF NOT EXISTS pixel_wars_rounds (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at      TEXT NOT NULL,
      winner_owner TEXT,
      winner_tile  INTEGER,
      paint_count  INTEGER,
      finalized_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pw_rounds_ends ON pixel_wars_rounds(ends_at);

    CREATE TABLE IF NOT EXISTS pixel_wars_champion (
      tile_id    INTEGER PRIMARY KEY,
      owner      TEXT NOT NULL,
      badge_until TEXT NOT NULL,
      round_id   INTEGER
    );
  `);
}
ensurePixelWarsTables();

/** Expire old paints + ensure a current round exists. */
function pixelWarsHousekeeping(db) {
  // Expire paints
  db.prepare(`DELETE FROM pixel_wars_paints WHERE expires_at <= datetime('now')`).run();
  // Close finished rounds
  const finishedRound = db.prepare(
    `SELECT * FROM pixel_wars_rounds WHERE finalized_at IS NULL AND ends_at <= datetime('now') LIMIT 1`
  ).get();
  if (finishedRound) {
    // Determine winner: wallet with most active paints this round
    const winner = db.prepare(
      `SELECT owner, owner_tile, COUNT(*) as cnt
       FROM pixel_wars_paints
       WHERE painted_at >= ? AND painted_at <= ?
       GROUP BY owner ORDER BY cnt DESC LIMIT 1`
    ).get(finishedRound.started_at, finishedRound.ends_at);
    if (winner) {
      // Award champion badge for 24h
      const badgeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(
        `INSERT INTO pixel_wars_champion (tile_id, owner, badge_until, round_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tile_id) DO UPDATE SET owner=excluded.owner, badge_until=excluded.badge_until, round_id=excluded.round_id`
      ).run(winner.owner_tile, winner.owner, badgeUntil, finishedRound.id);
      db.prepare(
        `UPDATE pixel_wars_rounds SET winner_owner=?, winner_tile=?, paint_count=?, finalized_at=datetime('now') WHERE id=?`
      ).run(winner.owner, winner.owner_tile, winner.cnt, finishedRound.id);
    } else {
      db.prepare(`UPDATE pixel_wars_rounds SET finalized_at=datetime('now') WHERE id=?`).run(finishedRound.id);
    }
    // Expire old champion badges
    db.prepare(`DELETE FROM pixel_wars_champion WHERE badge_until <= datetime('now')`).run();
  }
  // Ensure there is always an active round
  const activeRound = db.prepare(
    `SELECT id FROM pixel_wars_rounds WHERE finalized_at IS NULL AND ends_at > datetime('now') LIMIT 1`
  ).get();
  if (!activeRound) {
    const endsAt = new Date(Date.now() + PIXEL_WARS_ROUND_HOURS * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`INSERT INTO pixel_wars_rounds (ends_at) VALUES (?)`).run(endsAt);
  }
}

/** Paint an unclaimed tile adjacent to the wallet's owned tile. */
export function pixelWarsPaint(ownerTileId, targetTileId, color, wallet) {
  const db = getDb();
  pixelWarsHousekeeping(db);

  // Validate color
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Color must be a hex value like #FF5500');

  // Owner must own the tile they're painting from
  const ownerTile = db.prepare('SELECT id, owner, name FROM tiles WHERE id = ?').get(ownerTileId);
  if (!ownerTile) throw new Error('Owner tile not found');
  if (!ownerTile.owner) throw new Error('Owner tile is not claimed');
  if (ownerTile.owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('Not the owner of the source tile');

  // Target must be unclaimed
  const target = db.prepare('SELECT id, owner FROM tiles WHERE id = ?').get(targetTileId);
  if (target && target.owner) throw new Error('Target tile is already claimed — only unclaimed tiles can be painted');

  // Tiles must be adjacent
  if (!areAdjacent(ownerTileId, targetTileId)) throw new Error('Target tile must be adjacent to your tile');

  // Rate limit: max 5 paints per wallet per rolling hour
  const GRID = 256;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const recentPaints = db.prepare(
    `SELECT COUNT(*) as cnt FROM pixel_wars_paints WHERE owner = ? AND painted_at >= ?`
  ).get(wallet.toLowerCase(), oneHourAgo);
  if (recentPaints.cnt >= PIXEL_WARS_RATE_LIMIT) {
    throw new Error(`Rate limit: you can paint at most ${PIXEL_WARS_RATE_LIMIT} tiles per hour`);
  }

  const expiresAt = new Date(Date.now() + PIXEL_WARS_PAINT_TTL_HOURS * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(
    `INSERT INTO pixel_wars_paints (tile_id, owner, owner_tile, color, painted_at, expires_at)
     VALUES (?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(tile_id) DO UPDATE SET owner=excluded.owner, owner_tile=excluded.owner_tile,
       color=excluded.color, painted_at=excluded.painted_at, expires_at=excluded.expires_at`
  ).run(targetTileId, wallet.toLowerCase(), ownerTileId, color, expiresAt);

  return {
    tileId: targetTileId,
    ownerTile: ownerTileId,
    color,
    expiresAt,
    ownerName: ownerTile.name || `Tile #${ownerTileId}`,
  };
}

/** Remove a paint placed by this wallet on a tile. */
export function pixelWarsErase(targetTileId, wallet) {
  const db = getDb();
  const paint = db.prepare('SELECT * FROM pixel_wars_paints WHERE tile_id = ?').get(targetTileId);
  if (!paint) throw new Error('No paint on this tile');
  if (paint.owner !== wallet.toLowerCase()) throw new Error('You did not paint this tile');
  db.prepare('DELETE FROM pixel_wars_paints WHERE tile_id = ?').run(targetTileId);
  return { ok: true };
}

/** Get all active (non-expired) pixel war paints as a map { tileId: color }. */
export function getPixelWarsMap() {
  const db = getDb();
  pixelWarsHousekeeping(db);
  const rows = db.prepare(
    `SELECT tile_id, color, owner, owner_tile, expires_at FROM pixel_wars_paints WHERE expires_at > datetime('now')`
  ).all();
  const map = {};
  for (const r of rows) map[r.tile_id] = { color: r.color, owner: r.owner, ownerTile: r.owner_tile, expiresAt: r.expires_at };
  return map;
}

/** Get Pixel Wars leaderboard for the current round. */
export function getPixelWarsLeaderboard(limit = 20) {
  const db = getDb();
  pixelWarsHousekeeping(db);
  // Active round
  const round = db.prepare(
    `SELECT * FROM pixel_wars_rounds WHERE finalized_at IS NULL AND ends_at > datetime('now') ORDER BY id DESC LIMIT 1`
  ).get();
  // Paint counts per wallet in the active round (only active paints count)
  const entries = db.prepare(
    `SELECT p.owner, p.owner_tile, COUNT(*) as paint_count,
            t.name as tile_name, t.avatar as tile_avatar
     FROM pixel_wars_paints p
     LEFT JOIN tiles t ON t.id = p.owner_tile
     WHERE p.expires_at > datetime('now')
     GROUP BY p.owner
     ORDER BY paint_count DESC
     LIMIT ?`
  ).all(limit);
  // Champion badge
  const champion = db.prepare(
    `SELECT pc.*, t.name as tile_name, t.avatar as tile_avatar
     FROM pixel_wars_champion pc
     LEFT JOIN tiles t ON t.id = pc.tile_id
     WHERE pc.badge_until > datetime('now')
     LIMIT 1`
  ).get();
  return { round, entries, champion };
}

/** Get paints by a specific wallet. */
export function getPixelWaintsByWallet(wallet) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM pixel_wars_paints WHERE owner = ? AND expires_at > datetime('now') ORDER BY painted_at DESC`
  ).get(wallet.toLowerCase());
}

/** Check if a tile is currently painted. */
export function getPixelWarsPaint(tileId) {
  const db = getDb();
  const paint = db.prepare(
    `SELECT * FROM pixel_wars_paints WHERE tile_id = ? AND expires_at > datetime('now')`
  ).get(tileId);
  return paint || null;
}

/** Get champion badge for a tile (if active). */
export function getPixelWarsChampionBadge(tileId) {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM pixel_wars_champion WHERE tile_id = ? AND badge_until > datetime('now')`
  ).get(tileId) || null;
}

/** Map of all tiles that are currently Pixel Champion. */
export function getPixelWarsChampionTiles() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT tile_id FROM pixel_wars_champion WHERE badge_until > datetime('now')`
  ).all();
  return new Set(rows.map(r => r.tile_id));
}

// ─── Capture the Flag ─────────────────────────────────────────────────────────

function ensureCtfTables() {
  const db = getDb();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ctf_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_tile_id      INTEGER NOT NULL,
      captured_by_tile  INTEGER,
      captured_by_wallet TEXT,
      spawned_at        TEXT NOT NULL DEFAULT (datetime('now')),
      captured_at       TEXT,
      expires_at        TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ctf_flag_tile ON ctf_events(flag_tile_id)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ctf_spawned ON ctf_events(spawned_at DESC)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ctf_wallet ON ctf_events(captured_by_wallet)
  `).run();
}

ensureCtfTables();

const CTF_FLAG_TTL_MINUTES = 30;
const CTF_WEEKLY_LEADERBOARD_LIMIT = 20;

export function getActiveCtfFlag() {
  const db = getDb();
  const flag = db.prepare(
    `SELECT * FROM ctf_events WHERE captured_at IS NULL AND expires_at > datetime('now') ORDER BY spawned_at DESC LIMIT 1`
  ).get();
  if (!flag) return null;
  return {
    id: flag.id,
    flagTileId: flag.flag_tile_id,
    spawnedAt: flag.spawned_at,
    expiresAt: flag.expires_at,
  };
}

export function spawnCtfFlag() {
  const db = getDb();
  // Only spawn if no active flag
  const active = getActiveCtfFlag();
  if (active) return { alreadyActive: true, flag: active };

  // Pick a random unclaimed tile (unclaimed tiles have no row in tiles table)
  // Get all claimed tile IDs to exclude them
  const claimedIds = new Set(
    db.prepare(`SELECT id FROM tiles WHERE owner IS NOT NULL AND owner != '0x0000000000000000000000000000000000000000'`)
      .all().map(r => r.id)
  );
  const totalTiles = TOTAL_TILES; // 65536
  // Try up to 100 random picks to find an unclaimed tile
  let flagTileId = null;
  for (let i = 0; i < 100; i++) {
    const candidate = Math.floor(Math.random() * totalTiles);
    if (!claimedIds.has(candidate)) {
      flagTileId = candidate;
      break;
    }
  }
  if (flagTileId === null) return { error: 'No unclaimed tiles available' };
  const row = { id: flagTileId };

  const expiresAt = new Date(Date.now() + CTF_FLAG_TTL_MINUTES * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
  const result = db.prepare(
    `INSERT INTO ctf_events (flag_tile_id, expires_at) VALUES (?, ?)`
  ).run(row.id, expiresAt);

  return {
    spawned: true,
    flag: {
      id: result.lastInsertRowid,
      flagTileId: row.id,
      expiresAt,
    },
  };
}

export function captureCtfFlag(flagEventId, capturingTileId, wallet) {
  const db = getDb();
  const event = db.prepare(
    `SELECT * FROM ctf_events WHERE id = ? AND captured_at IS NULL AND expires_at > datetime('now')`
  ).get(flagEventId);
  if (!event) throw new Error('No active flag with that ID');

  // Verify adjacency (Manhattan distance)
  if (!areAdjacent(event.flag_tile_id, capturingTileId)) {
    throw new Error('Your tile must be adjacent to the flag tile');
  }

  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  db.prepare(
    `UPDATE ctf_events SET captured_by_tile = ?, captured_by_wallet = ?, captured_at = ? WHERE id = ?`
  ).run(capturingTileId, wallet.toLowerCase(), now, flagEventId);

  return db.prepare('SELECT * FROM ctf_events WHERE id = ?').get(flagEventId);
}

export function getCtfWeeklyLeaderboard(limit = CTF_WEEKLY_LEADERBOARD_LIMIT) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT captured_by_wallet as wallet, COUNT(*) as captures
     FROM ctf_events
     WHERE captured_at IS NOT NULL
       AND captured_at >= datetime('now', '-7 days')
     GROUP BY captured_by_wallet
     ORDER BY captures DESC
     LIMIT ?`
  ).all(limit);
  return rows.map(r => ({
    wallet: r.wallet,
    captures: r.captures,
  }));
}

export function getCtfStats() {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) as n FROM ctf_events WHERE captured_at IS NOT NULL`).get()?.n || 0;
  const thisWeek = db.prepare(`SELECT COUNT(*) as n FROM ctf_events WHERE captured_at IS NOT NULL AND captured_at >= datetime('now', '-7 days')`).get()?.n || 0;
  const active = getActiveCtfFlag();
  return { totalCaptures: total, weeklyCaptures: thisWeek, activeFlag: active };
}

// ─── Featured Tile Spotlight ──────────────────────────────────────────────────

function ensureFeaturedTilesTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS featured_tiles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tile_id     INTEGER NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
      owner       TEXT NOT NULL,
      starts_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at     TEXT NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 5,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_featured_ends ON featured_tiles(ends_at DESC);
    CREATE INDEX IF NOT EXISTS idx_featured_tile ON featured_tiles(tile_id);
  `);
}

export function createFeaturedSpot({ tileId, owner, durationHours = 24, paidAmount = 5 }) {
  ensureFeaturedTilesTable();
  const db = getDb();

  const tile = db.prepare('SELECT id, name, avatar FROM tiles WHERE id = ?').get(tileId);
  if (!tile) throw new Error('Tile not found');

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();
  const result = db.prepare(
    `INSERT INTO featured_tiles (tile_id, owner, ends_at, paid_amount)
     VALUES (?, ?, ?, ?)`
  ).run(tileId, owner.toLowerCase(), endsAt, paidAmount);

  logEvent('spotlight_purchased', tileId, owner, {
    duration_hours: durationHours,
    paid_amount: paidAmount,
    ends_at: endsAt,
  });

  return { id: Number(result.lastInsertRowid), tile_id: tileId, owner: owner.toLowerCase(), ends_at: endsAt, paid_amount: paidAmount };
}

export function getActiveFeaturedTiles(limit = 8) {
  ensureFeaturedTilesTable();
  const db = getDb();
  const rows = db.prepare(`
    SELECT f.id, f.tile_id, f.owner, f.starts_at, f.ends_at, f.paid_amount,
           t.name, t.avatar, t.description, t.category, t.status, t.url, t.x_handle, t.color, t.image_url
    FROM featured_tiles f
    JOIN tiles t ON t.id = f.tile_id
    WHERE f.ends_at > datetime('now')
    ORDER BY f.starts_at DESC
    LIMIT ?
  `).all(limit);
  return rows.map(r => ({
    featuredId: r.id,
    tileId: r.tile_id,
    owner: r.owner,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    paidAmount: r.paid_amount,
    tile: {
      id: r.tile_id,
      name: r.name,
      avatar: r.avatar,
      description: r.description,
      category: r.category,
      status: r.status,
      url: r.url,
      x_handle: r.x_handle,
      color: r.color,
      image_url: r.image_url,
    },
  }));
}

export function isTileFeatured(tileId) {
  ensureFeaturedTilesTable();
  const db = getDb();
  const row = db.prepare(
    `SELECT id FROM featured_tiles WHERE tile_id = ? AND ends_at > datetime('now') LIMIT 1`
  ).get(tileId);
  return !!row;
}
