// In-memory tile store — will be replaced by DB later

const TOTAL_TILES = 65536;
const HEARTBEAT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// tiles: Map<number, TileData>
const tiles = new Map();

function getTile(id) {
  return tiles.get(id) || null;
}

function setTile(id, data) {
  tiles.set(id, data);
}

function getAllTiles() {
  const result = {};
  for (const [id, tile] of tiles) {
    result[id] = tile;
  }
  return result;
}

function getClaimedCount() {
  return tiles.size;
}

// Exponential bonding curve: price = e^(ln(11111) * totalMinted / 65536)
function getCurrentPrice() {
  const totalMinted = tiles.size;
  return Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES);
}

function claimTile(id, wallet) {
  if (tiles.has(id)) return null; // already claimed
  if (id < 0 || id >= TOTAL_TILES) return null;

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
  };
  tiles.set(id, tile);
  return tile;
}

function updateTileMetadata(id, metadata) {
  const tile = tiles.get(id);
  if (!tile) return null;
  const allowed = ['name', 'avatar', 'description', 'category', 'color', 'url', 'xHandle'];
  for (const key of allowed) {
    if (metadata[key] !== undefined) {
      tile[key] = metadata[key];
    }
  }
  tiles.set(id, tile);
  return tile;
}

function heartbeat(id, wallet) {
  const tile = tiles.get(id);
  if (!tile || tile.owner !== wallet) return null;
  tile.status = 'online';
  tile.lastHeartbeat = Date.now();
  tiles.set(id, tile);
  return tile;
}

// Check and expire stale heartbeats
function checkHeartbeats() {
  const now = Date.now();
  for (const [, tile] of tiles) {
    if (tile.status === 'online' && tile.lastHeartbeat && now - tile.lastHeartbeat > HEARTBEAT_TTL_MS) {
      tile.status = 'offline';
    }
  }
}

export {
  TOTAL_TILES,
  getTile,
  setTile,
  getAllTiles,
  getClaimedCount,
  getCurrentPrice,
  claimTile,
  updateTileMetadata,
  heartbeat,
  checkHeartbeats,
};
