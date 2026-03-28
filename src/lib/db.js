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
    `SELECT id, name, avatar, category, owner, last_heartbeat, status FROM tiles WHERE last_heartbeat IS NOT NULL ORDER BY last_heartbeat DESC LIMIT ?`
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
