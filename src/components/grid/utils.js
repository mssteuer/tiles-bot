const GRID_SIZE = 256;
const TILE_SIZE = 32; // base tile size in pixels
const GRID_PX = GRID_SIZE * TILE_SIZE; // 8192px

const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

// Heartbeat thresholds
const HB_GREEN = 5 * 60 * 1000;   // 5 minutes
const HB_YELLOW = 30 * 60 * 1000; // 30 minutes

// ── Heat map ──────────────────────────────────────────────────────────────────
// Activity score: 0 (cold) → 1 (hot). Factors:
//   - Recent heartbeat (0–0.50): recency within last hour
//   - Has name/description/category (0–0.20): metadata richness
//   - Has image (0.10): visual presence
//   - Has social verification (0–0.20): G/X badges
//   - Tile age bonus (0–0.10): older tiles get slight credit (committed, not flash-claimed)
function getTileActivityScore(tile) {
  if (!tile) return 0;
  let score = 0;
  const now = Date.now();

  // Heartbeat recency (max 0.50)
  if (tile.lastHeartbeat) {
    const age = now - tile.lastHeartbeat;
    const ONE_HOUR = 60 * 60 * 1000;
    if (age <= HB_GREEN) {
      score += 0.50; // pulsing green = maximum
    } else if (age <= HB_YELLOW) {
      score += 0.35; // yellow warm
    } else if (age <= ONE_HOUR) {
      score += 0.20 * (1 - (age - HB_YELLOW) / (ONE_HOUR - HB_YELLOW));
    }
    // >1h: no heartbeat bonus
  }

  // Metadata richness (max 0.20)
  let metaScore = 0;
  if (tile.name && tile.name !== `Tile #${tile.id}`) metaScore += 0.08;
  if (tile.description && tile.description.length > 10) metaScore += 0.06;
  if (tile.category) metaScore += 0.03;
  if (tile.url) metaScore += 0.03;
  score += Math.min(0.20, metaScore);

  // Image (0.10)
  if (tile.imageUrl) score += 0.10;

  // Social verification (max 0.20)
  if (tile.githubVerified) score += 0.10;
  if (tile.xVerified) score += 0.10;

  // Tile age bonus (max 0.10) — tiles older than 7 days get full credit
  if (tile.claimedAt) {
    const ageDays = (now - new Date(tile.claimedAt).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.min(0.10, ageDays / 7 * 0.10);
  }

  return Math.min(1, score);
}

// Map score [0,1] → RGBA color string (cold blue → warm yellow → hot red)
function heatmapColor(score, alpha = 0.72) {
  // 0.0–0.3: blue (#3b82f6) → cyan-ish
  // 0.3–0.6: cyan → yellow (#facc15)
  // 0.6–1.0: yellow → red (#ef4444)
  let r, g, b;
  if (score < 0.3) {
    const t = score / 0.3;
    r = Math.round(59 + t * (34 - 59));     // 59→34
    g = Math.round(130 + t * (197 - 130));  // 130→197
    b = Math.round(246 + t * (94 - 246));   // 246→94
  } else if (score < 0.6) {
    const t = (score - 0.3) / 0.3;
    r = Math.round(34 + t * (250 - 34));    // 34→250
    g = Math.round(197 + t * (204 - 197));  // 197→204
    b = Math.round(94 + t * (21 - 94));     // 94→21
  } else {
    const t = (score - 0.6) / 0.4;
    r = Math.round(250 + t * (239 - 250));  // 250→239
    g = Math.round(204 + t * (68 - 204));   // 204→68
    b = Math.round(21 + t * (68 - 21));     // 21→68
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// Image cache: cacheKey -> ImageBitmap | 'loading' | 'error'
// Uses createImageBitmap() for off-main-thread decoding — drawImage(bitmap) is a
// zero-decode blit, unlike drawImage(HTMLImageElement) which decodes synchronously
// on the main thread every frame (the 557ms "Image decode" in the profile).
const imageCache = {};

function getThumbUrl(tile, hd = false) {
  // 64px for zoomed-out grid, 256px for zoomed-in detail
  return hd
    ? `/tile-images/thumb-hd/${tile.id}.webp`
    : `/tile-images/thumb/${tile.id}.webp`;
}

// Concurrent fetch limiter with priority lanes
// Priority queue (spans) processes first, then regular queue (tiles)
const priorityQueue = [];
const fetchQueue = [];
let activeFetches = 0;
const MAX_CONCURRENT = 8;

function scheduleFetch(url, cacheKey, priority = false) {
  return new Promise((resolve) => {
    function run() {
      activeFetches++;
      fetch(url, { signal: AbortSignal.timeout(8000) })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(blob => createImageBitmap(blob))
        .then(bmp => { imageCache[cacheKey] = bmp; resolve(bmp); })
        .catch(() => { imageCache[cacheKey] = 'error'; resolve(null); })
        .finally(() => {
          activeFetches--;
          // Priority queue drains first
          if (priorityQueue.length > 0) priorityQueue.shift()();
          else if (fetchQueue.length > 0) fetchQueue.shift()();
        });
    }
    if (activeFetches < MAX_CONCURRENT) run();
    else if (priority) priorityQueue.push(run);
    else fetchQueue.push(run);
  });
}

function loadTileImage(tile, hd = false) {
  if (!tile.imageUrl) return null;
  const tier = hd ? 'hd' : 'sd';
  const cacheKey = `thumb:${tier}:${tile.id}:${tile.imageUrl}`;
  if (imageCache[cacheKey]) return imageCache[cacheKey];
  imageCache[cacheKey] = 'loading';
  const thumbUrl = getThumbUrl(tile, hd);
  const fallbackUrl = hd ? getThumbUrl(tile, false) : `/tile-images/${tile.id}.png`;
  fetch(thumbUrl, { signal: AbortSignal.timeout(6000) })
    .then(r => { if (!r.ok) throw new Error('404'); return r.blob(); })
    .then(blob => createImageBitmap(blob))
    .then(bmp => { imageCache[cacheKey] = bmp; })
    .catch(() => {
      fetch(fallbackUrl, { signal: AbortSignal.timeout(6000) })
        .then(r => { if (!r.ok) throw new Error('404'); return r.blob(); })
        .then(blob => createImageBitmap(blob))
        .then(bmp => { imageCache[cacheKey] = bmp; })
        .catch(() => { imageCache[cacheKey] = 'error'; });
    });
  return null;
}

function getHeartbeatGlowColor(lastHeartbeat) {
  if (!lastHeartbeat) return null;
  const age = Date.now() - lastHeartbeat;
  if (age <= HB_GREEN) return 'rgba(34,197,94,0.55)';   // green, pulsing
  if (age <= HB_YELLOW) return 'rgba(234,179,8,0.35)';  // yellow, dim
  return null; // >30 min: no glow
}

function tileMatchesFilter(tile, searchQuery, categoryFilter) {
  const normalizedCategoryFilter = categoryFilter?.toLowerCase();
  const matchesCategory = !normalizedCategoryFilter || normalizedCategoryFilter === 'all' ||
    tile.category?.toLowerCase() === normalizedCategoryFilter;
  const normalizedSearch = searchQuery?.toLowerCase();
  const matchesSearch = !normalizedSearch ||
    tile.name?.toLowerCase().includes(normalizedSearch) ||
    tile.owner?.toLowerCase().includes(normalizedSearch) ||
    tile.description?.toLowerCase().includes(normalizedSearch);
  return matchesCategory && matchesSearch;
}

function hasActiveFilter(searchQuery, categoryFilter) {
  const normalizedCategoryFilter = categoryFilter?.toLowerCase();
  return Boolean(searchQuery && searchQuery.length > 0) || Boolean(normalizedCategoryFilter && normalizedCategoryFilter !== 'all');
}

function getFirstMatchingTile(tiles, searchQuery, categoryFilter) {
  return Object.values(tiles)
    .filter(tile => tileMatchesFilter(tile, searchQuery, categoryFilter))
    .sort((a, b) => a.id - b.id)[0] || null;
}

// ── Mobile gesture hints (auto-dismiss after 4s) ─────────────────────────

export { GRID_SIZE, TILE_SIZE, GRID_PX, CATEGORY_COLORS, HB_GREEN, HB_YELLOW, getTileActivityScore, heatmapColor, getThumbUrl, scheduleFetch, loadTileImage, getHeartbeatGlowColor, tileMatchesFilter, hasActiveFilter, getFirstMatchingTile };
