'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import BatchClaimModal from './BatchClaimModal';
import MultiTileSpanModal from './MultiTileSpanModal';

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

// Image cache: tileId -> HTMLImageElement or 'loading' or 'error'
const imageCache = {};

function getSizedImageUrl(url, size) {
  if (!url) return null;
  if (url.includes('?')) return `${url}&size=${size}`;
  return `${url}?size=${size}`;
}

function loadTileImage(tile) {
  const url = getSizedImageUrl(tile.imageUrl, 64);
  if (!url) return null;
  // Include URL in cache key so new images replace stale cached versions
  const cacheKey = `${tile.id}:64:${tile.imageUrl}`;
  if (imageCache[cacheKey]) return imageCache[cacheKey];
  // Clear any old cache entry for this tile
  for (const k of Object.keys(imageCache)) {
    if (k.startsWith(`${tile.id}:64:`) && k !== cacheKey) delete imageCache[k];
  }
  imageCache[cacheKey] = 'loading';
  const img = new Image();
  img.onload = () => { imageCache[cacheKey] = img; };
  img.onerror = () => { imageCache[cacheKey] = 'error'; };
  img.src = url;
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
function MobileHints() {
  const [visible, setVisible] = useState(true);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  useEffect(() => {
    if (!isMobile) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [isMobile]);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(10,10,15,0.92)', border: '1px solid #1a1a2e', borderRadius: 10,
      padding: '10px 16px', zIndex: 30, backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#94a3b8',
      maxWidth: '90vw', textAlign: 'center', animation: 'fadeIn 0.3s ease',
    }}
    onClick={() => setVisible(false)}>
      <div>👆 <strong style={{ color: '#e2e8f0' }}>Tap</strong> a tile to view or claim</div>
      <div>✌️ <strong style={{ color: '#e2e8f0' }}>Two fingers</strong> to pan & pinch to zoom</div>
    </div>
  );
}

export default function Grid({ tiles, connections, pendingRequests, onConnectionsChange, onTileClick, selectedTile, zoom, onZoomChange, viewMode, searchQuery, categoryFilter, heatmapMode, blocks, spans, onBlockClaimRequest, onSpanClaimRequest, flyToTileId }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const starfieldRef = useRef(null);
  const [camera, setCamera] = useState({ x: GRID_PX / 2, y: GRID_PX / 2, zoom: 0.05 }); // start zoomed out (full grid visible)

  // Generate starfield once (off-screen canvas)
  useEffect(() => {
    const sw = 2048, sh = 2048;
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const sx = c.getContext('2d');
    // Deep space gradient
    const grd = sx.createRadialGradient(sw/2, sh/2, 0, sw/2, sh/2, sw * 0.7);
    grd.addColorStop(0, '#0d0d1a');
    grd.addColorStop(0.5, '#080812');
    grd.addColorStop(1, '#050508');
    sx.fillStyle = grd;
    sx.fillRect(0, 0, sw, sh);
    // Nebula clouds
    for (let i = 0; i < 5; i++) {
      const nx = Math.random() * sw, ny = Math.random() * sh;
      const nr = 150 + Math.random() * 300;
      const ng = sx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      const hue = [220, 270, 190, 320, 200][i]; // blue, purple, teal, pink, cyan
      ng.addColorStop(0, `hsla(${hue}, 60%, 30%, 0.06)`);
      ng.addColorStop(0.5, `hsla(${hue}, 50%, 20%, 0.03)`);
      ng.addColorStop(1, 'transparent');
      sx.fillStyle = ng;
      sx.fillRect(0, 0, sw, sh);
    }
    // Stars
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * sw, y = Math.random() * sh;
      const r = Math.random() < 0.05 ? 1.5 + Math.random() : 0.5 + Math.random() * 0.8;
      const brightness = 0.3 + Math.random() * 0.7;
      sx.beginPath();
      sx.arc(x, y, r, 0, Math.PI * 2);
      sx.fillStyle = `rgba(255,255,255,${brightness})`;
      sx.fill();
    }
    // A few colored stars
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * sw, y = Math.random() * sh;
      const hue = [0, 30, 200, 220, 60][i % 5]; // red, orange, blue, cyan, yellow
      sx.beginPath();
      sx.arc(x, y, 1 + Math.random(), 0, Math.PI * 2);
      sx.fillStyle = `hsla(${hue}, 80%, 70%, ${0.4 + Math.random() * 0.4})`;
      sx.fill();
    }
    starfieldRef.current = c;
  }, []);
  const introPlayed = useRef(false);

  // Intro animation: full grid overview → zoom into densest tile cluster
  useEffect(() => {
    if (introPlayed.current) return;

    // Wait until tiles are actually loaded AND canvas is mounted
    const ids = Object.keys(tiles).map(Number);
    const container = containerRef.current;
    if (ids.length === 0 || !container) return;

    introPlayed.current = true;

    // Calculate zoom that fits entire grid in viewport
    const rect = container.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / GRID_PX, rect.height / GRID_PX);

    // Start: entire grid visible, centered
    const startX = GRID_PX / 2;
    const startY = GRID_PX / 2;
    const startZoom = fitZoom;

    // Target: densest cluster — slide a window across the grid, find peak density
    const WINDOW = 20; // 20×20 tile window
    const coords = ids.map(id => ({ r: Math.floor(id / GRID_SIZE), c: id % GRID_SIZE }));

    let bestCount = 0, bestR = 128, bestC = 128;
    // Build a set for O(1) lookup
    const occupied = new Set(ids);

    for (const { r: seedR, c: seedC } of coords) {
      // Check window centered on each tile
      const wr = Math.max(0, seedR - Math.floor(WINDOW / 2));
      const wc = Math.max(0, seedC - Math.floor(WINDOW / 2));
      let count = 0;
      for (let dr = 0; dr < WINDOW && wr + dr < GRID_SIZE; dr++) {
        for (let dc = 0; dc < WINDOW && wc + dc < GRID_SIZE; dc++) {
          if (occupied.has((wr + dr) * GRID_SIZE + (wc + dc))) count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestR = wr + WINDOW / 2;
        bestC = wc + WINDOW / 2;
      }
    }

    const targetX = bestC * TILE_SIZE + TILE_SIZE / 2;
    const targetY = bestR * TILE_SIZE + TILE_SIZE / 2;
    const targetZoom = 2; // deep zoom so individual tiles are clearly visible

    // Set initial camera to show full grid
    setCamera({ x: startX, y: startY, zoom: startZoom });

    const duration = 2500; // 2.5 seconds
    const startTime = performance.now();

    // Ease-in-out for a cinematic feel
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const e = easeInOutCubic(t);

      setCamera({
        x: startX + (targetX - startX) * e,
        y: startY + (targetY - startY) * e,
        zoom: startZoom * Math.pow(targetZoom / startZoom, e), // exponential zoom feels natural
      });

      if (t < 1) requestAnimationFrame(animate);
    }

    // Brief pause so user sees the full grid first
    setTimeout(() => requestAnimationFrame(animate), 600);
  }, [tiles, zoom]);

  // Fly-to animation: smooth zoom-out → arc pan → zoom-in
  const flyToRef = useRef(null);
  useEffect(() => {
    if (!flyToTileId || !tiles) return;
    const targetId = typeof flyToTileId === 'object' ? flyToTileId.id : flyToTileId;
    if (targetId == null) return;

    // Target position: center of the tile
    const col = targetId % GRID_SIZE;
    const row = Math.floor(targetId / GRID_SIZE);
    const targetX = col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = row * TILE_SIZE + TILE_SIZE / 2;
    const targetZoom = 2;

    // Capture start state
    const startX = camera.x;
    const startY = camera.y;
    const startZoom = camera.zoom;

    // Calculate a mid-zoom (zoom out before panning) — proportional to distance
    const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
    const midZoom = Math.min(startZoom, targetZoom) * Math.max(0.3, 1 - dist / GRID_PX);

    const duration = 1800; // ms
    const startTime = performance.now();

    function easeInOutQuart(x) {
      return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2;
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const e = easeInOutQuart(t);

      // Three-phase zoom: start → mid (zoom out) → target (zoom in)
      let z;
      if (t < 0.4) {
        const p = t / 0.4;
        z = startZoom + (midZoom - startZoom) * p;
      } else {
        const p = (t - 0.4) / 0.6;
        z = midZoom + (targetZoom - midZoom) * easeInOutQuart(p);
      }

      // Slight arc on the pan path (perpendicular offset)
      const dx = targetX - startX;
      const dy = targetY - startY;
      const arcStrength = dist * 0.08;
      const arcT = Math.sin(e * Math.PI); // peaks at midpoint
      const perpX = -dy / (dist || 1) * arcStrength * arcT;
      const perpY = dx / (dist || 1) * arcStrength * arcT;

      setCamera({
        x: startX + dx * e + perpX,
        y: startY + dy * e + perpY,
        zoom: z,
      });

      if (t < 1) {
        flyToRef.current = requestAnimationFrame(animate);
      }
    }

    flyToRef.current = requestAnimationFrame(animate);
    return () => { if (flyToRef.current) cancelAnimationFrame(flyToRef.current); };
  }, [flyToTileId]);

  const [hoveredTile, setHoveredTile] = useState(null);
  const [batchTiles, setBatchTiles] = useState(null); // array of tile IDs for batch modal
  const batchTilesRef = useRef(null);
  useEffect(() => { batchTilesRef.current = batchTiles; }, [batchTiles]);

  // Drag/pan state
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Drag-select state
  const isSelecting = useRef(false);
  const selectStart = useRef(null); // { gridX, gridY } in canvas coords
  const selectEnd = useRef(null);
  const dragSelectedTiles = useRef(new Set()); // tiles in current drag selection
  const [selectionRect, setSelectionRect] = useState(null); // { x1,y1,x2,y2 } in screen

  // Animation frame for pulsing glow
  const animFrame = useRef(null);
  const pulsePhase = useRef(0);

  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // Connections ref (kept in sync with prop for draw callback)
  const connectionsRef = useRef(connections || []);
  useEffect(() => { connectionsRef.current = connections || []; }, [connections]);

  const pendingRequestsRef = useRef(pendingRequests || {});
  useEffect(() => { pendingRequestsRef.current = pendingRequests || {}; }, [pendingRequests]);

  // Block map ref: tileId → block object (for render lookup)
  const blockMapRef = useRef({});
  useEffect(() => {
    const map = {};
    if (blocks) {
      for (const block of blocks) {
        const tileIds = typeof block.tileIds === 'string' ? JSON.parse(block.tileIds) : (block.tileIds || []);
        for (const tid of tileIds) {
          map[tid] = block;
        }
      }
    }
    blockMapRef.current = map;
  }, [blocks]);

  const screenToGrid = useCallback((sx, sy) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = sx - rect.width / 2;
    const cy = sy - rect.height / 2;
    const gx = cx / cameraRef.current.zoom + cameraRef.current.x;
    const gy = cy / cameraRef.current.zoom + cameraRef.current.y;
    const col = Math.floor(gx / TILE_SIZE);
    const row = Math.floor(gy / TILE_SIZE);
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;
    return row * GRID_SIZE + col;
  }, []);

  // Screen coords → grid pixel coords
  const screenToGridPx = useCallback((sx, sy) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = sx - rect.width / 2;
    const cy = sy - rect.height / 2;
    return {
      gx: cx / cameraRef.current.zoom + cameraRef.current.x,
      gy: cy / cameraRef.current.zoom + cameraRef.current.y,
    };
  }, []);

  // Sync zoom prop into camera
  useEffect(() => {
    if (zoom !== undefined && zoom !== camera.zoom) {
      setCamera(prev => ({ ...prev, zoom }));
    }
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload images for visible tiles
  useEffect(() => {
    Object.values(tiles).forEach(tile => {
      if (tile.imageUrl) loadTileImage(tile);
    });
  }, [tiles]);

  // heatmapMode ref for draw callback
  const heatmapModeRef = useRef(heatmapMode);
  useEffect(() => { heatmapModeRef.current = heatmapMode; }, [heatmapMode]);

  // Draw function (called in animation loop)
  const draw = useCallback(() => {
    if (viewMode === 'list') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const isFilterActive = hasActiveFilter(searchQuery, categoryFilter);
    const cam = cameraRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Resize canvas if needed
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }

    const ctx = canvas.getContext('2d');
    // Always reset the transform before drawing to prevent compounding scale on every frame.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;

    // Clear with starfield background
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, w, h);
    if (starfieldRef.current) {
      // Tile the starfield with slight parallax (moves slower than camera)
      const sf = starfieldRef.current;
      const parallax = 0.15;
      const offX = (-cam.x * parallax * cam.zoom) % sf.width;
      const offY = (-cam.y * parallax * cam.zoom) % sf.height;
      for (let tx = offX - sf.width; tx < w + sf.width; tx += sf.width) {
        for (let ty = offY - sf.height; ty < h + sf.height; ty += sf.height) {
          ctx.drawImage(sf, tx, ty);
        }
      }
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Visible bounds
    const left = cam.x - w / 2 / cam.zoom;
    const top = cam.y - h / 2 / cam.zoom;
    const right = cam.x + w / 2 / cam.zoom;
    const bottom = cam.y + h / 2 / cam.zoom;

    const minCol = Math.max(0, Math.floor(left / TILE_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.floor(right / TILE_SIZE));
    const minRow = Math.max(0, Math.floor(top / TILE_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.floor(bottom / TILE_SIZE));

    // Grid lines (only when zoomed enough)
    if (cam.zoom > 0.08) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 / cam.zoom;
      for (let col = minCol; col <= maxCol + 1; col++) {
        ctx.beginPath();
        ctx.moveTo(col * TILE_SIZE, minRow * TILE_SIZE);
        ctx.lineTo(col * TILE_SIZE, (maxRow + 1) * TILE_SIZE);
        ctx.stroke();
      }
      for (let row = minRow; row <= maxRow + 1; row++) {
        ctx.beginPath();
        ctx.moveTo(minCol * TILE_SIZE, row * TILE_SIZE);
        ctx.lineTo((maxCol + 1) * TILE_SIZE, row * TILE_SIZE);
        ctx.stroke();
      }
    }

    // Tiles
    const now = Date.now();
    const pulse = 0.6 + 0.4 * Math.sin(pulsePhase.current); // 0.2–1.0

    // Draw rectangular image spans first
    const drawnSpanIds = new Set();
    const tilesInSpans = new Set(); // tiles that belong to rendered spans — skip individual render
    for (const span of (spans || [])) {
      const tileIds = typeof span.tileIds === 'string' ? JSON.parse(span.tileIds) : (span.tileIds || []);
      if (!tileIds.length || span.status !== 'ready') continue;
      if (drawnSpanIds.has(span.id)) continue;

      const firstTile = tiles[tileIds[0]];
      if (!firstTile?.owner) continue;
      const owner = firstTile.owner.toLowerCase();
      const ownershipIntact = tileIds.every((tileId) => tiles[tileId]?.owner && tiles[tileId].owner.toLowerCase() == owner);
      if (!ownershipIntact) continue;

      drawnSpanIds.add(span.id);
      tileIds.forEach(tid => tilesInSpans.add(tid));
      const tlCol = span.topLeftId % GRID_SIZE;
      const tlRow = Math.floor(span.topLeftId / GRID_SIZE);
      const sx = tlCol * TILE_SIZE;
      const sy = tlRow * TILE_SIZE;
      const sw = span.width * TILE_SIZE;
      const sh = span.height * TILE_SIZE;

      const spanImgKey = `span:${span.id}`;
      ctx.save();
      ctx.fillStyle = 'rgba(14,165,233,0.10)';
      ctx.fillRect(sx, sy, sw, sh);
      if (span.imageUrl) {
        let cachedSpanImg = imageCache[spanImgKey];
        if (!cachedSpanImg) {
          imageCache[spanImgKey] = 'loading';
          const img = new window.Image();
          img.src = span.imageUrl;
          img.onload = () => { imageCache[spanImgKey] = img; };
          img.onerror = () => { imageCache[spanImgKey] = 'error'; };
        } else if (cachedSpanImg !== 'loading' && cachedSpanImg !== 'error') {
          ctx.drawImage(cachedSpanImg, sx, sy, sw, sh);
        }
      }
      // Outer span border
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2 / cam.zoom;
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);

      // Grid lines over span (tile boundaries)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5 / cam.zoom;
      ctx.beginPath();
      for (let c = 1; c < span.width; c++) {
        ctx.moveTo(sx + c * TILE_SIZE, sy);
        ctx.lineTo(sx + c * TILE_SIZE, sy + sh);
      }
      for (let r = 1; r < span.height; r++) {
        ctx.moveTo(sx, sy + r * TILE_SIZE);
        ctx.lineTo(sx + sw, sy + r * TILE_SIZE);
      }
      ctx.stroke();

      // Hover + selected + fly-to highlights on individual span tiles
      for (const tid of tileIds) {
        const tc = tid % GRID_SIZE;
        const tr = Math.floor(tid / GRID_SIZE);
        const tx = tc * TILE_SIZE;
        const ty = tr * TILE_SIZE;

        if (hoveredTile === tid) {
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
        }
        if (selectedTile === tid) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3 / cam.zoom;
          ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
        }
        if (flyToTileId && (typeof flyToTileId === 'object' ? flyToTileId.id : flyToTileId) === tid) {
          ctx.fillStyle = 'rgba(59,130,246,0.25)';
          ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3 / cam.zoom;
          ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
        }
      }

      ctx.restore();
    }

    // Draw blocks first (as merged rectangles behind individual tiles)
    const drawnBlockIds = new Set();
    for (const block of (blocks || [])) {
      const tileIds = typeof block.tileIds === 'string' ? JSON.parse(block.tileIds) : (block.tileIds || []);
      if (!tileIds.length) continue;
      const blockId = block.id;
      if (drawnBlockIds.has(blockId)) continue;
      drawnBlockIds.add(blockId);

      const topLeftId = block.topLeftId ?? block.top_left_id;
      const bs = block.blockSize ?? block.block_size ?? 2;
      const tlCol = topLeftId % GRID_SIZE;
      const tlRow = Math.floor(topLeftId / GRID_SIZE);
      const bx = tlCol * TILE_SIZE;
      const by = tlRow * TILE_SIZE;
      const bw = bs * TILE_SIZE;
      const bh = bs * TILE_SIZE;

      // Skip blocks fully outside viewport
      if (bx + bw < left * cam.zoom || bx > right || by + bh < top * cam.zoom || by > bottom) continue;

      const blockColor = block.color || '#7c3aed'; // purple default

      // Draw merged block background
      ctx.save();
      ctx.fillStyle = blockColor + '33';
      ctx.fillRect(bx, by, bw, bh);

      // Draw block image if available
      const blockImgKey = `block:${blockId}:${bs === 2 ? 128 : 256}`;
      if (block.imageUrl) {
        let cachedBlockImg = imageCache[blockImgKey];
        if (!cachedBlockImg) {
          imageCache[blockImgKey] = 'loading';
          const img = new window.Image();
          img.src = block.imageUrl;
          img.onload = () => { imageCache[blockImgKey] = img; };
          img.onerror = () => { imageCache[blockImgKey] = 'error'; };
        } else if (cachedBlockImg !== 'loading' && cachedBlockImg !== 'error') {
          ctx.save();
          ctx.beginPath();
          ctx.rect(bx + 2, by + 2, bw - 4, bh - 4);
          ctx.clip();
          ctx.drawImage(cachedBlockImg, bx + 2, by + 2, bw - 4, bh - 4);
          ctx.restore();
        }
      } else {
        // Avatar/emoji fallback
        const emojiSize = Math.min(bw * 0.4, 24);
        ctx.font = `${emojiSize}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(block.avatar || '⬜', bx + bw / 2, by + bh / 2);
      }

      // Purple border
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 2.5 / cam.zoom;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

      // Size badge (2×2 / 3×3) in corner
      if (cam.zoom > 0.15) {
        const badgeText = `${bs}×${bs}`;
        const badgePad = 2 / cam.zoom;
        const badgeFontSize = Math.max(5, 7 / cam.zoom);
        ctx.font = `bold ${badgeFontSize}px system-ui`;
        const tw = ctx.measureText(badgeText).width;
        const bpx = bx + bw - tw - badgePad * 2 - 2 / cam.zoom;
        const bpy = by + 2 / cam.zoom;
        ctx.fillStyle = '#7c3aed';
        ctx.fillRect(bpx - badgePad, bpy, tw + badgePad * 2, badgeFontSize + badgePad * 2);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(badgeText, bpx, bpy + badgePad);
      }

      ctx.restore();
    }

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const id = row * GRID_SIZE + col;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const tile = tiles[id];

        // Skip non-top-left tiles that belong to a block (block renders as merged rect above)
        const tileBlock = blockMapRef.current[id];
        if (tileBlock) {
          const topLeftId = tileBlock.topLeftId ?? tileBlock.top_left_id;
          if (id !== topLeftId) continue; // non-top-left block tile — skip individual render
        }

        // Skip tiles that belong to a rendered span — span already drew the image
        if (tilesInSpans.has(id)) continue;

        if (tile) {
          const baseColor = tile.color || CATEGORY_COLORS[tile.category] || '#333';
          const tileMatches = !isFilterActive || tileMatchesFilter(tile, searchQuery, categoryFilter);

          ctx.save();
          if (!tileMatches) ctx.globalAlpha = 0.25;

          // ── Heartbeat glow halo ──────────────────────────────────────
          if (tile.lastHeartbeat) {
            const age = now - tile.lastHeartbeat;
            if (age <= HB_GREEN) {
              // Pulsing green glow
              const alpha = (0.3 + 0.5 * pulse).toFixed(2);
              ctx.save();
              ctx.shadowColor = `rgba(34,197,94,${alpha})`;
              ctx.shadowBlur = 12 / cam.zoom;
              ctx.fillStyle = `rgba(34,197,94,${(0.1 * pulse).toFixed(2)})`;
              ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
              ctx.restore();
            } else if (age <= HB_YELLOW) {
              // Dim yellow glow
              ctx.save();
              ctx.shadowColor = 'rgba(234,179,8,0.3)';
              ctx.shadowBlur = 8 / cam.zoom;
              ctx.fillStyle = 'rgba(234,179,8,0.06)';
              ctx.fillRect(x - 1, y - 1, TILE_SIZE + 2, TILE_SIZE + 2);
              ctx.restore();
            }
          }

          // Try to draw image first
          const cachedImg = tile.imageUrl ? imageCache[`${tile.id}:64:${tile.imageUrl}`] : null;
          if (cachedImg && cachedImg !== 'loading' && cachedImg !== 'error') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.clip();
            ctx.drawImage(cachedImg, x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.restore();
          } else {
            // Colored background + emoji
            ctx.fillStyle = baseColor;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

            if (cam.zoom > 0.2) {
              ctx.font = `${Math.min(20, TILE_SIZE * 0.5)}px system-ui`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(tile.avatar || '🤖', x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 2);
            }
          }

          // Border
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 1.5 / cam.zoom;
          ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

          // Status dot, verification badges, and name overlays disabled for clean tile display

          // Highlight selected
          if (selectedTile === id) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3 / cam.zoom;
            ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          }

          // Fly-to highlight
          if (flyToTileId && (typeof flyToTileId === 'object' ? flyToTileId.id : flyToTileId) === id) {
            ctx.fillStyle = 'rgba(59,130,246,0.25)';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 3 / cam.zoom;
            ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          }

          // Pending connection request badge (orange dot with count)
          const pendingCount = pendingRequestsRef.current[id];
          if (pendingCount > 0 && cam.zoom > 0.15) {
            const badgeR = Math.max(6, TILE_SIZE * 0.22);
            const bx = x + TILE_SIZE - badgeR * 0.5;
            const by = y + badgeR * 0.5;
            ctx.beginPath();
            ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
            ctx.fillStyle = '#f97316';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5 / cam.zoom;
            ctx.stroke();
            if (cam.zoom > 0.4) {
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${Math.round(badgeR * 1.1)}px system-ui`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(pendingCount), bx, by + 0.5);
            }
          }

          ctx.restore();
        }

        // Drag-selection highlight (works on ALL tiles, claimed or not)
        const inBatchOuter = batchTilesRef.current && batchTilesRef.current.includes(id);
        const inDragOuter = dragSelectedTiles.current.has(id);
        if (inBatchOuter || inDragOuter) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2.5 / cam.zoom;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          ctx.fillStyle = 'rgba(59,130,246,0.2)';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }

        // Hover highlight
        if (hoveredTile === id && !inDragOuter) {
          ctx.fillStyle = tile ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.08)';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = tile ? '#fff' : '#3b82f6';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // ── Heat map overlay ──────────────────────────────────────────────────
    if (heatmapModeRef.current) {
      ctx.save();
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const id = row * GRID_SIZE + col;
          const tile = tiles[id];
          if (!tile) continue;

          const score = getTileActivityScore(tile);
          if (score < 0.01) continue; // skip cold tiles (unclaimed or zero activity)

          const x = col * TILE_SIZE;
          const y = row * TILE_SIZE;

          // Semi-transparent color overlay — covers the tile
          const overlayAlpha = 0.55 + score * 0.35; // 0.55–0.90
          ctx.fillStyle = heatmapColor(score, overlayAlpha);
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

          // Glow halo for hot tiles (score >= 0.6)
          if (score >= 0.6) {
            const glowAlpha = (score - 0.6) / 0.4 * 0.7; // 0–0.7
            ctx.save();
            ctx.shadowColor = heatmapColor(score, 1);
            ctx.shadowBlur = 14 / cam.zoom * score;
            ctx.fillStyle = heatmapColor(score, glowAlpha * 0.3);
            ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
            ctx.restore();
          }

          // Score text when zoomed in (score > 0.3)
          if (cam.zoom > 0.6 && score > 0.15) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.font = `bold ${Math.min(7, TILE_SIZE * 0.2)}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(score * 100)}`, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
            ctx.restore();
          }
        }
      }
      ctx.restore();

      // ── Heat map legend (screen-space, fixed bottom-left) ──────────────
      ctx.restore(); // exit world-space
      ctx.save();
      const legendW = 160;
      const legendH = 14;
      const legendX = 16;
      const legendY = h - 54;

      // Background pill
      ctx.fillStyle = 'rgba(10,10,15,0.80)';
      ctx.beginPath();
      ctx.roundRect(legendX - 8, legendY - 22, legendW + 16, legendH + 36, 8);
      ctx.fill();

      // Label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Activity', legendX, legendY - 16);

      // Gradient bar
      const grad = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
      grad.addColorStop(0,    heatmapColor(0,    1));
      grad.addColorStop(0.3,  heatmapColor(0.3,  1));
      grad.addColorStop(0.6,  heatmapColor(0.6,  1));
      grad.addColorStop(1,    heatmapColor(1,    1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendW, legendH, 4);
      ctx.fill();

      // Tick labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Cold', legendX, legendY + legendH + 3);
      ctx.textAlign = 'right';
      ctx.fillText('Hot', legendX + legendW, legendY + legendH + 3);
      ctx.restore();

      // Re-enter world-space for connection lines
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
    }

    // ── Connection lines (neighbor network) ──────────────────────────────
    const conns = connectionsRef.current;
    if (conns && conns.length > 0 && cam.zoom > 0.05) {
      for (const conn of conns) {
        const fromTile = tiles[conn.fromId];
        const toTile = tiles[conn.toId];
        if (!fromTile || !toTile) continue;

        const fromCol = conn.fromId % GRID_SIZE;
        const fromRow = Math.floor(conn.fromId / GRID_SIZE);
        const toCol = conn.toId % GRID_SIZE;
        const toRow = Math.floor(conn.toId / GRID_SIZE);

        // Center points of each tile
        const x1 = fromCol * TILE_SIZE + TILE_SIZE / 2;
        const y1 = fromRow * TILE_SIZE + TILE_SIZE / 2;
        const x2 = toCol * TILE_SIZE + TILE_SIZE / 2;
        const y2 = toRow * TILE_SIZE + TILE_SIZE / 2;

        // Skip if both tiles are far outside viewport (optimization)
        const bufPx = 2 * TILE_SIZE;
        const inView = (
          (x1 >= left - bufPx && x1 <= right + bufPx && y1 >= top - bufPx && y1 <= bottom + bufPx) ||
          (x2 >= left - bufPx && x2 <= right + bufPx && y2 >= top - bufPx && y2 <= bottom + bufPx)
        );
        if (!inView) continue;

        // Determine line color: green if both online, yellow if one is online, grey otherwise
        const fromOnline = fromTile.lastHeartbeat && (now - fromTile.lastHeartbeat <= HB_GREEN);
        const toOnline = toTile.lastHeartbeat && (now - toTile.lastHeartbeat <= HB_GREEN);
        const fromYellow = !fromOnline && fromTile.lastHeartbeat && (now - fromTile.lastHeartbeat <= HB_YELLOW);
        const toYellow = !toOnline && toTile.lastHeartbeat && (now - toTile.lastHeartbeat <= HB_YELLOW);

        let lineColor, lineAlpha;
        if (fromOnline && toOnline) {
          // Both live: bright green pulse
          lineColor = `rgba(34,197,94,${(0.5 + 0.4 * pulse).toFixed(2)})`;
          lineAlpha = 0.9 + 0.1 * pulse;
        } else if (fromOnline || toOnline || fromYellow || toYellow) {
          // At least one is yellow-warm
          lineColor = 'rgba(234,179,8,0.4)';
          lineAlpha = 0.4;
        } else {
          // Both offline
          lineColor = 'rgba(100,116,139,0.25)';
          lineAlpha = 0.25;
        }

        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = Math.max(0.5, 1.5 / cam.zoom);
        ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw a small midpoint dot on the line when zoomed in
        if (cam.zoom > 0.3) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          ctx.globalAlpha = lineAlpha * 0.8;
          ctx.fillStyle = lineColor;
          ctx.beginPath();
          ctx.arc(mx, my, Math.max(1, 2.5 / cam.zoom), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    // Grid border
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(0, 0, GRID_PX, GRID_PX);

    ctx.restore();
  }, [tiles, hoveredTile, selectedTile, viewMode, searchQuery, categoryFilter, heatmapMode]); // camera via ref, connections via ref, heatmapMode via ref

  // Animation loop for pulsing glow
  useEffect(() => {
    if (viewMode === 'list') return;
    let frame;
    let lastT = 0;
    const loop = (t) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      pulsePhase.current += dt * 2.5; // ~2.5 rad/sec
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw, viewMode]);

  // Auto-center the grid on the first matching tile when filters change.
  useEffect(() => {
    if (viewMode === 'list') return;
    if (!hasActiveFilter(searchQuery, categoryFilter)) return;

    const firstMatch = getFirstMatchingTile(tiles, searchQuery, categoryFilter);
    if (!firstMatch) return;

    const targetX = (firstMatch.id % GRID_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    const targetY = Math.floor(firstMatch.id / GRID_SIZE) * TILE_SIZE + TILE_SIZE / 2;

    setCamera(prev => {
      const alreadyCentered = Math.abs(prev.x - targetX) < TILE_SIZE / 2 && Math.abs(prev.y - targetY) < TILE_SIZE / 2;
      if (alreadyCentered) return prev;
      return {
        ...prev,
        x: targetX,
        y: targetY,
        zoom: Math.max(prev.zoom, 0.6),
      };
    });
  }, [tiles, searchQuery, categoryFilter, viewMode]);

  // Resize
  useEffect(() => {
    const handleResize = () => setCamera(c => ({ ...c }));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.12;
    setCamera(prev => {
      const newZoom = Math.max(0.02, Math.min(8, prev.zoom * factor));
      if (onZoomChange) onZoomChange(newZoom);
      return { ...prev, zoom: newZoom };
    });
  }, [onZoomChange]);

  // ── Tool mode: 'pan' (hand) or 'select' (crosshair) ──────────────────
  const [tool, setTool] = useState('pan'); // default: pan
  const [spanRequest, setSpanRequest] = useState(null);
  const shiftHeld = useRef(false);
  const effectiveTool = useCallback(() => shiftHeld.current ? 'select' : tool, [tool]);

  // Track shift key globally
  useEffect(() => {
    const down = (e) => { if (e.key === 'Shift') shiftHeld.current = true; };
    const up = (e) => { if (e.key === 'Shift') shiftHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Desktop mouse handlers ──────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDragging.current = true;
    dragMoved.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (effectiveTool() === 'select') {
      // Start selection immediately
      const px = screenToGridPx(e.clientX - rect.left, e.clientY - rect.top);
      if (!px) return;
      isSelecting.current = true;
      selectStart.current = { ...px, sx: e.clientX, sy: e.clientY };
      selectEnd.current = { ...px };
    } else {
      isSelecting.current = false;
      selectStart.current = null;
    }
  }, [screenToGridPx, effectiveTool]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    setHoveredTile(tileId);

    if (!isDragging.current) return;

    if (isSelecting.current && selectStart.current) {
      // Selection drag
      const px = screenToGridPx(e.clientX - rect.left, e.clientY - rect.top);
      if (px) selectEnd.current = px;

      // Compute highlighted tiles
      const gx1 = Math.min(selectStart.current.gx, selectEnd.current.gx);
      const gy1 = Math.min(selectStart.current.gy, selectEnd.current.gy);
      const gx2 = Math.max(selectStart.current.gx, selectEnd.current.gx);
      const gy2 = Math.max(selectStart.current.gy, selectEnd.current.gy);
      const col1 = Math.max(0, Math.floor(gx1 / TILE_SIZE));
      const row1 = Math.max(0, Math.floor(gy1 / TILE_SIZE));
      const col2 = Math.min(GRID_SIZE - 1, Math.floor(gx2 / TILE_SIZE));
      const row2 = Math.min(GRID_SIZE - 1, Math.floor(gy2 / TILE_SIZE));
      const s = new Set();
      for (let r = row1; r <= row2; r++)
        for (let c = col1; c <= col2; c++)
          s.add(r * GRID_SIZE + c);
      dragSelectedTiles.current = s;

      setSelectionRect({
        x1: Math.min(selectStart.current.sx, e.clientX) - rect.left,
        y1: Math.min(selectStart.current.sy, e.clientY) - rect.top,
        x2: Math.max(selectStart.current.sx, e.clientX) - rect.left,
        y2: Math.max(selectStart.current.sy, e.clientY) - rect.top,
      });
    } else {
      // Pan drag
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setCamera(prev => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
    }
  }, [screenToGrid, screenToGridPx]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setSelectionRect(null);
    dragSelectedTiles.current = new Set();

    if (isSelecting.current && selectStart.current && selectEnd.current) {
      isSelecting.current = false;
      const gx1 = Math.min(selectStart.current.gx, selectEnd.current.gx);
      const gy1 = Math.min(selectStart.current.gy, selectEnd.current.gy);
      const gx2 = Math.max(selectStart.current.gx, selectEnd.current.gx);
      const gy2 = Math.max(selectStart.current.gy, selectEnd.current.gy);
      const col1 = Math.max(0, Math.floor(gx1 / TILE_SIZE));
      const row1 = Math.max(0, Math.floor(gy1 / TILE_SIZE));
      const col2 = Math.min(GRID_SIZE - 1, Math.floor(gx2 / TILE_SIZE));
      const row2 = Math.min(GRID_SIZE - 1, Math.floor(gy2 / TILE_SIZE));

      if (col1 <= col2 && row1 <= row2) {
        const selected = [];
        for (let r = row1; r <= row2; r++)
          for (let c = col1; c <= col2; c++)
            selected.push(r * GRID_SIZE + c);
        if (selected.length > 1) {
          const allOwned = selected.every((id) => tiles[id]?.owner);
          const firstOwner = selected[0] != null ? tiles[selected[0]]?.owner?.toLowerCase() : null;
          const sameOwner = allOwned && selected.every((id) => tiles[id]?.owner?.toLowerCase() === firstOwner);
          if (sameOwner && onSpanClaimRequest) {
            setSpanRequest({ topLeftId: selected[0], tileIds: selected });
            return;
          }
          setBatchTiles(selected);
          return;
        }
        if (selected.length === 1) { onTileClick(selected[0]); return; }
      }
    } else if (!dragMoved.current) {
      // Click (no drag) → tile select
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      if (tileId !== null) onTileClick(tileId);
    }

    isSelecting.current = false;
    selectStart.current = null;
    selectEnd.current = null;
  }, [screenToGrid, onTileClick]);

  // ── Mobile touch handlers ───────────────────────────────────────────────
  // 1-finger tap = select tile
  // 2-finger drag = pan (midpoint tracks camera)
  // 2-finger pinch = zoom
  // 1-finger drag = nothing (prevents accidental claims after pan)
  const lastTouchDist = useRef(null);
  const lastTouchMid = useRef(null);
  const touchCount = useRef(0);
  const touchStartTime = useRef(0);
  const touchStartPos = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchCount.current = e.touches.length;
    if (e.touches.length === 2) {
      isDragging.current = false;
      dragMoved.current = true; // block tap detection
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
      lastTouchMid.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      isDragging.current = false;
      dragMoved.current = false;
      touchStartTime.current = Date.now();
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      // Start selection drag if select tool is active
      if (tool === 'select') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const px = screenToGridPx(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
          if (px) {
            isDragging.current = true;
            isSelecting.current = true;
            selectStart.current = { ...px, sx: e.touches[0].clientX, sy: e.touches[0].clientY };
            selectEnd.current = px;
          }
        }
      }
    }
  }, [tool, screenToGridPx]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };

      // Pinch zoom
      if (lastTouchDist.current) {
        const factor = dist / lastTouchDist.current;
        setCamera(prev => {
          const newZoom = Math.max(0.02, Math.min(8, prev.zoom * factor));
          if (onZoomChange) onZoomChange(newZoom);
          return { ...prev, zoom: newZoom };
        });
      }
      lastTouchDist.current = dist;

      // Two-finger pan
      if (lastTouchMid.current) {
        const panDx = mid.x - lastTouchMid.current.x;
        const panDy = mid.y - lastTouchMid.current.y;
        setCamera(prev => ({
          ...prev,
          x: prev.x - panDx / prev.zoom,
          y: prev.y - panDy / prev.zoom,
        }));
      }
      lastTouchMid.current = mid;
      dragMoved.current = true; // prevent tap on lift
    } else if (e.touches.length === 1 && touchStartPos.current) {
      const dx = e.touches[0].clientX - touchStartPos.current.x;
      const dy = e.touches[0].clientY - touchStartPos.current.y;
      if (Math.hypot(dx, dy) > 10) dragMoved.current = true;

      if (isSelecting.current && selectStart.current) {
        // Selection drag on mobile
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const px = screenToGridPx(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
          if (px) selectEnd.current = px;

          const gx1 = Math.min(selectStart.current.gx, selectEnd.current.gx);
          const gy1 = Math.min(selectStart.current.gy, selectEnd.current.gy);
          const gx2 = Math.max(selectStart.current.gx, selectEnd.current.gx);
          const gy2 = Math.max(selectStart.current.gy, selectEnd.current.gy);
          const col1 = Math.max(0, Math.floor(gx1 / TILE_SIZE));
          const row1 = Math.max(0, Math.floor(gy1 / TILE_SIZE));
          const col2 = Math.min(GRID_SIZE - 1, Math.floor(gx2 / TILE_SIZE));
          const row2 = Math.min(GRID_SIZE - 1, Math.floor(gy2 / TILE_SIZE));
          const s = new Set();
          for (let r = row1; r <= row2; r++)
            for (let c = col1; c <= col2; c++)
              s.add(r * GRID_SIZE + c);
          dragSelectedTiles.current = s;

          setSelectionRect({
            x1: Math.min(selectStart.current.sx, e.touches[0].clientX) - rect.left,
            y1: Math.min(selectStart.current.sy, e.touches[0].clientY) - rect.top,
            x2: Math.max(selectStart.current.sx, e.touches[0].clientX) - rect.left,
            y2: Math.max(selectStart.current.sy, e.touches[0].clientY) - rect.top,
          });
        }
      } else if (tool === 'pan' && dragMoved.current) {
        // Single-finger pan when in pan mode
        setCamera(prev => ({
          ...prev,
          x: prev.x - dx / prev.zoom,
          y: prev.y - dy / prev.zoom,
        }));
        touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, [onZoomChange, tool, screenToGridPx]);

  const handleTouchEnd = useCallback((e) => {
    // Finalize selection if we were selecting
    if (isSelecting.current && selectStart.current && selectEnd.current && dragMoved.current) {
      isSelecting.current = false;
      setSelectionRect(null);
      dragSelectedTiles.current = new Set();

      const gx1 = Math.min(selectStart.current.gx, selectEnd.current.gx);
      const gy1 = Math.min(selectStart.current.gy, selectEnd.current.gy);
      const gx2 = Math.max(selectStart.current.gx, selectEnd.current.gx);
      const gy2 = Math.max(selectStart.current.gy, selectEnd.current.gy);
      const col1 = Math.max(0, Math.floor(gx1 / TILE_SIZE));
      const row1 = Math.max(0, Math.floor(gy1 / TILE_SIZE));
      const col2 = Math.min(GRID_SIZE - 1, Math.floor(gx2 / TILE_SIZE));
      const row2 = Math.min(GRID_SIZE - 1, Math.floor(gy2 / TILE_SIZE));
      const ids = [];
      for (let r = row1; r <= row2; r++)
        for (let c = col1; c <= col2; c++)
          ids.push(r * GRID_SIZE + c);
      if (ids.length > 1) {
        setBatchTiles(ids);
      }
      selectStart.current = null;
      selectEnd.current = null;
    }
    // Only trigger tap if single finger, no movement, short duration
    else if (!dragMoved.current && touchCount.current === 1 && touchStartPos.current) {
      const elapsed = Date.now() - touchStartTime.current;
      if (elapsed < 300) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const tileId = screenToGrid(
            touchStartPos.current.x - rect.left,
            touchStartPos.current.y - rect.top
          );
          if (tileId !== null) onTileClick(tileId);
        }
      }
    }
    if (e.touches.length === 0) {
      isDragging.current = false;
      isSelecting.current = false;
      dragMoved.current = false;
      lastTouchDist.current = null;
      lastTouchMid.current = null;
      touchCount.current = 0;
      touchStartPos.current = null;
    }
  }, [screenToGrid, onTileClick]);

  // Wheel listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [handleWheel, handleTouchMove]);

  // ─── List view ───────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    const isFilterActive = hasActiveFilter(searchQuery, categoryFilter);
    const tileList = Object.values(tiles)
      .filter(tile => !isFilterActive || tileMatchesFilter(tile, searchQuery, categoryFilter))
      .sort((a, b) => a.id - b.id);
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: '#0a0a0f', padding: '8px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#555', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>#</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Agent</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Category</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Status</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Price paid</th>
              <th style={{ padding: '8px 4px', textAlign: 'left', borderBottom: '1px solid #1a1a2e' }}>Position</th>
            </tr>
          </thead>
          <tbody>
            {tileList.map(tile => (
              <tr
                key={tile.id}
                onClick={() => onTileClick(tile.id)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid #111',
                  background: selectedTile === tile.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = selectedTile === tile.id ? 'rgba(59,130,246,0.1)' : 'transparent'}
              >
                <td style={{ padding: '6px 4px', color: '#555' }}>{tile.id}</td>
                <td style={{ padding: '6px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tile.imageUrl ? (
                      <img src={getSizedImageUrl(tile.imageUrl, 64)} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{tile.avatar || '🤖'}</span>
                    )}
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{tile.name}</span>
                  </div>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: `${CATEGORY_COLORS[tile.category] || '#333'}22`,
                    color: CATEGORY_COLORS[tile.category] || '#666',
                  }}>{tile.category || 'other'}</span>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                    color: tile.status === 'online' ? '#22c55e' : '#ef4444',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                    {tile.status}
                  </span>
                </td>
                <td style={{ padding: '6px 4px', color: '#94a3b8' }}>
                  {tile.pricePaid ? `$${parseFloat(tile.pricePaid).toFixed(4)}` : '—'}
                </td>
                <td style={{ padding: '6px 4px', color: '#555', fontSize: 11 }}>
                  r{Math.floor(tile.id / 256)}, c{tile.id % 256}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tileList.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>No tiles match your filter.</div>
        )}
      </div>
    );
  }

  // ─── Canvas grid view ────────────────────────────────────────────────────
  return (
    <>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: tool === 'select' ? 'crosshair' : (isDragging.current ? 'grabbing' : 'grab') }}>
        <canvas
          id="grid-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isDragging.current = false; isSelecting.current = false; setHoveredTile(null); setSelectionRect(null); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
            if (tileId === null) return;
            if (e.shiftKey && onSpanClaimRequest && tiles[tileId]) {
              onSpanClaimRequest(tileId);
              return;
            }
            if (!onBlockClaimRequest) return;
            if (!tiles[tileId]) {
              onBlockClaimRequest(tileId);
            }
          }}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Drag-select overlay — outline only, no fill */}
        {selectionRect && (
          <div style={{
            position: 'absolute',
            left: selectionRect.x1,
            top: selectionRect.y1,
            width: selectionRect.x2 - selectionRect.x1,
            height: selectionRect.y2 - selectionRect.y1,
            border: '2px dashed rgba(59,130,246,0.9)',
            background: 'none',
            pointerEvents: 'none',
            borderRadius: 2,
          }} />
        )}

        {hoveredTile !== null && tiles[hoveredTile] && !selectionRect && (
          <div style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.9)',
            border: '1px solid #1a1a2e',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            zIndex: 10,
          }}>
            {tiles[hoveredTile].imageUrl ? (
              <img src={getSizedImageUrl(tiles[hoveredTile].imageUrl, 64)} alt="" style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover' }} />
            ) : (
              <span>{tiles[hoveredTile].avatar}</span>
            )}
            <strong>{tiles[hoveredTile].name}</strong>
            <span style={{ color: '#666' }}>#{hoveredTile}</span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: tiles[hoveredTile].status === 'online' ? '#22c55e' : '#ef4444',
            }} />
          </div>
        )}

        {/* Drag-select hint */}
        {selectionRect && (
          <div style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(59,130,246,0.9)',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 12,
            color: '#fff',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            Release to select tiles for batch claim
          </div>
        )}

        {/* ── Desktop tool toggle (bottom-right) ── */}
        <div className="tool-toggle" style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          gap: 4,
          background: 'rgba(10,10,15,0.85)',
          borderRadius: 8,
          padding: 4,
          border: '1px solid #1a1a2e',
          zIndex: 20,
          backdropFilter: 'blur(6px)',
        }}>
          <button
            onClick={() => setTool('pan')}
            title="Pan (drag to move)"
            style={{
              width: 36, height: 36, borderRadius: 6, border: 'none',
              cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tool === 'pan' ? 'rgba(59,130,246,0.3)' : 'transparent',
              color: tool === 'pan' ? '#60a5fa' : '#666',
            }}>✋</button>
          <button
            onClick={() => setTool('select')}
            title="Select (drag to multi-select, or hold Shift)"
            style={{
              width: 36, height: 36, borderRadius: 6, border: 'none',
              cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tool === 'select' ? 'rgba(59,130,246,0.3)' : 'transparent',
              color: tool === 'select' ? '#60a5fa' : '#666',
            }}>⬚</button>
        </div>

        {/* ── Mobile gesture hints (shown briefly, fades out) ── */}
        <MobileHints />
      </div>

      {/* Batch claim modal */}
      {batchTiles && (
        <BatchClaimModal
          tileIds={batchTiles}
          tiles={tiles}
          onClose={() => setBatchTiles(null)}
          onSpanClaimRequest={(topLeftId, selectedTileIds) => setSpanRequest({ topLeftId, tileIds: selectedTileIds })}
        />
      )}

      {spanRequest && (
        <MultiTileSpanModal
          topLeftId={spanRequest.topLeftId}
          initialTileIds={spanRequest.tileIds}
          tiles={tiles}
          onClose={() => setSpanRequest(null)}
          onCreated={() => {}}
        />
      )}
    </>
  );
}
