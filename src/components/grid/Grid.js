'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { FEATURES } from '@/lib/features';
import { playSound } from '@/lib/sound';
import BatchClaimModal from '../BatchClaimModal';
import MultiTileSpanModal from '../MultiTileSpanModal';
import ListView from './ListView';
import MobileHints from './MobileHints';
import TileTooltip from './TileTooltip';
import SelectionOverlay from './SelectionOverlay';
import ToolToggle from './ToolToggle';
import { GRID_SIZE, TILE_SIZE, GRID_PX, CATEGORY_COLORS, HB_GREEN, HB_YELLOW, imageCache, getTileActivityScore, heatmapColor, getThumbUrl, scheduleFetch, loadTileImage, getHeartbeatGlowColor, tileMatchesFilter, hasActiveFilter, getFirstMatchingTile } from './utils';

export default function Grid({ tiles, connections, pendingRequests, onConnectionsChange, onTileClick, selectedTile, zoom, onZoomChange, viewMode, searchQuery, categoryFilter, heatmapMode, blocks, spans, onBlockClaimRequest, onSpanClaimRequest, flyToTileId, actionAnimation, introReady, onIntroFinished, initialCamera, alliances, bountyTiles, pixelWars, pixelWarsChampions, ctfFlag = null, tdInvasions = [] }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const starfieldRef = useRef(null);
  const activeAnimationsRef = useRef([]);
  const [camera, setCamera] = useState(() => {
    if (initialCamera) return initialCamera;
    // Fallback: restore from sessionStorage (survives SPA nav even if window prop is lost)
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('tiles_camera');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed.x === 'number' && typeof parsed.zoom === 'number') return parsed;
        }
      } catch {}
    }
    return { x: GRID_PX / 2, y: GRID_PX / 2, zoom: 0.008 };
  });

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
    if (introPlayed.current) {
      introFinished.current = true;
      if (onIntroFinished) onIntroFinished();
      return;
    }

    // Skip intro if returning from SPA navigation (camera restored) or deep link
    const hasSavedCamera = initialCamera || (typeof window !== 'undefined' && !!sessionStorage.getItem('tiles_camera'));
    if (hasSavedCamera || flyToTileId) {
      introPlayed.current = true;
      introFinished.current = true;
      if (typeof window !== 'undefined') {
        window.__tiles_camera = cameraRef.current;
        try { sessionStorage.setItem('tiles_camera', JSON.stringify(cameraRef.current)); } catch {}
      }
      if (onIntroFinished) onIntroFinished();
      return;
    }

    // Wait until tiles loaded, canvas mounted, AND onboarding complete
    const ids = Object.keys(tiles).map(Number);
    const container = containerRef.current;
    if (ids.length === 0 || !container || !introReady) {
      return;
    }

    introPlayed.current = true;

    // Start: super zoomed out — grid is ~1/8th of the viewport
    const rect = container.getBoundingClientRect();
    const startZoom = Math.min(rect.width, rect.height) / (GRID_PX * 8);

    const startX = GRID_PX / 2;
    const startY = GRID_PX / 2;

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

    const duration = 3000; // 3 seconds — longer sweep across more zoom range
    const startTime = performance.now();

    // Ease-in-out for a cinematic feel
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Store animation params — the main draw loop will drive this
    cameraRef.current = { x: startX, y: startY, zoom: startZoom };

    setTimeout(() => {
      introAnimRef.current = {
        startX, startY, startZoom, targetX, targetY, targetZoom,
        duration, startTime: null, ease: easeInOutCubic,
      };
    }, 1000);
  }, [tiles, zoom, introReady]);

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

    // Store animation params — the main draw loop drives this
    flyToAnimRef.current = {
      startX, startY, startZoom, targetX, targetY, targetZoom,
      midZoom, dist, duration, startTime: null, // lazy init on first frame
      ease: easeInOutQuart,
    };

    // Centralised sound: small delay so it syncs with visible camera movement
    setTimeout(() => playSound('whoosh'), 150);
  }, [flyToTileId]);

  // Action animation trigger
  useEffect(() => {
    if (!actionAnimation) return;
    const { fromTile, toTile, emoji, actionType } = actionAnimation;
    const toRow = Math.floor(toTile / 256), toCol = toTile % 256;
    const endX = toCol * TILE_SIZE + TILE_SIZE / 2;
    const endY = toRow * TILE_SIZE + TILE_SIZE / 2;
    // Start from the viewer's viewport top-left corner (world space),
    // not the source tile — source may be off-screen for any given viewer
    const cam = cameraRef.current;
    const container = containerRef.current;
    const vw = container ? container.clientWidth : 1920;
    const vh = container ? container.clientHeight : 1080;
    // Start from viewport top-center (world space) — guaranteed visible
    const startX = cam.x;
    const startY = cam.y - (vh / 2) / cam.zoom + 40 / cam.zoom;
    activeAnimationsRef.current.push({
      startX, startY, endX, endY,
      emoji: emoji || '🐟',
      actionType: actionType || 'slap',
      startTime: Date.now(),
      duration: actionType === 'emote' ? 2000 : 1500,
    });
  }, [actionAnimation]);

  const [hoveredTile, setHoveredTile] = useState(null);
  const [batchTiles, setBatchTiles] = useState(null); // array of tile IDs for batch modal
  const batchTilesRef = useRef(null);
  useEffect(() => { batchTilesRef.current = batchTiles; }, [batchTiles]);

  // Drag/pan state
  const isDragging = useRef(false);
  const [isPanning, setIsPanning] = useState(false); // reactive state for cursor
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
  useEffect(() => {
    cameraRef.current = camera;
    // Persist camera state — survives SPA navigation
    // Only save AFTER intro finishes to prevent seeing saved state and skipping intro on first visit
    if (typeof window !== 'undefined' && introFinished.current) {
      window.__tiles_camera = camera;
      try { sessionStorage.setItem('tiles_camera', JSON.stringify(camera)); } catch {}
    }
  }, [camera]);

  // Connections ref (kept in sync with prop for draw callback)
  const connectionsRef = useRef(connections || []);
  useEffect(() => { connectionsRef.current = connections || []; }, [connections]);

  const pendingRequestsRef = useRef(pendingRequests || {});
  useEffect(() => { pendingRequestsRef.current = pendingRequests || {}; }, [pendingRequests]);

  const bountyTilesRef = useRef(bountyTiles || {});
  useEffect(() => { bountyTilesRef.current = bountyTiles || {}; }, [bountyTiles]);

  const pixelWarsRef = useRef(pixelWars || {});
  useEffect(() => { pixelWarsRef.current = pixelWars || {}; }, [pixelWars]);

  const pixelWarsChampionsRef = useRef(new Set(pixelWarsChampions || []));
  useEffect(() => { pixelWarsChampionsRef.current = new Set(pixelWarsChampions || []); }, [pixelWarsChampions]);

  const ctfFlagRef = useRef(ctfFlag);
  useEffect(() => { ctfFlagRef.current = ctfFlag; }, [ctfFlag]);
  const tdInvasionsRef = useRef(tdInvasions);
  useEffect(() => { tdInvasionsRef.current = tdInvasions; }, [tdInvasions]);

  // Block tiles feature removed

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

  // Sync zoom prop into camera — but NOT until intro animation is done
  const introFinished = useRef(false);
  const introAnimRef = useRef(null);
  const flyToAnimRef = useRef(null);
  useEffect(() => {
    if (!introFinished.current) return; // don't override camera during intro
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

  // heatmapMode removed

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

    const visibleCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);

    // Grid lines (only when zoomed enough, not too many cells, and not animating)
    const isAnimatingEarly = !!(introAnimRef.current || flyToAnimRef.current);
    if (cam.zoom > 0.08 && visibleCells < 20000 && !isAnimatingEarly) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 / cam.zoom;
      ctx.beginPath();
      for (let col = minCol; col <= maxCol + 1; col++) {
        ctx.moveTo(col * TILE_SIZE, minRow * TILE_SIZE);
        ctx.lineTo(col * TILE_SIZE, (maxRow + 1) * TILE_SIZE);
      }
      for (let row = minRow; row <= maxRow + 1; row++) {
        ctx.moveTo(minCol * TILE_SIZE, row * TILE_SIZE);
        ctx.lineTo((maxCol + 1) * TILE_SIZE, row * TILE_SIZE);
      }
      ctx.stroke();
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

      const spanUseHD = cam.zoom > 0.3;
      const spanTier = spanUseHD ? 'hd' : 'sd';
      const spanImgKey = `span:${spanTier}:${span.id}`;
      ctx.save();

      // ── Span-level heartbeat glow — if ANY tile in span is online ──
      const spanHasOnline = tileIds.some(tid => tiles[tid]?.status === 'online');
      if (spanHasOnline) {
        const a = 0.06 + 0.08 * pulse;
        ctx.fillStyle = `rgba(34,197,94,${a.toFixed(3)})`;
        ctx.fillRect(sx - 6, sy - 6, sw + 12, sh + 12);
        ctx.fillStyle = `rgba(34,197,94,${(a * 1.5).toFixed(3)})`;
        ctx.fillRect(sx - 3, sy - 3, sw + 6, sh + 6);
      }

      ctx.fillStyle = 'rgba(14,165,233,0.10)';
      ctx.fillRect(sx, sy, sw, sh);
      if (span.imageUrl) {
        let cachedSpanImg = imageCache[spanImgKey];
        if (!cachedSpanImg) {
          // Use pre-generated WebP thumbnail if available, fall back to full-size
          const thumbUrl = spanUseHD
            ? `/tile-images/spans/${span.id}/thumb-hd.webp`
            : `/tile-images/spans/${span.id}/thumb.webp`;
          imageCache[spanImgKey] = 'loading';
          scheduleFetch(thumbUrl, spanImgKey, true); // priority — spans are visual centerpieces
        } else if (cachedSpanImg !== 'loading' && cachedSpanImg !== 'error') {
          ctx.drawImage(cachedSpanImg, sx, sy, sw, sh);
        }
        // If HD requested but still loading, try SD as interim
        if (spanUseHD && (!cachedSpanImg || cachedSpanImg === 'loading')) {
          const sdSpan = imageCache[`span:sd:${span.id}`];
          if (sdSpan && sdSpan !== 'loading' && sdSpan !== 'error') {
            ctx.drawImage(sdSpan, sx, sy, sw, sh);
          }
        }
      }
      // Fallback: if master image failed, render individual tile slices
      if (imageCache[spanImgKey] === 'error' && span.sliceImageUrls) {
        const sliceUrls = span.sliceImageUrls;
        for (const tileId of (span.tileIds || [])) {
          const sliceUrl = sliceUrls[String(tileId)];
          if (!sliceUrl) continue;
          const sliceKey = `slice:${tileId}:${sliceUrl}`;
          let sliceBmp = imageCache[sliceKey];
          if (!sliceBmp) {
            imageCache[sliceKey] = 'loading';
            // Use thumb version of slice tile image
            const sliceThumb = `/tile-images/thumb/${tileId}.webp`;
            scheduleFetch(sliceThumb, sliceKey);
          } else if (sliceBmp !== 'loading' && sliceBmp !== 'error') {
            const tRow = Math.floor(tileId / GRID_SIZE);
            const tCol = tileId % GRID_SIZE;
            ctx.drawImage(sliceBmp, tCol * TILE_SIZE, tRow * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
      // ── Span-level custom effects (use first tile's effects for entire span) ──
      const spanFirstTile = tiles[tileIds[0]];
      const spanFx = spanFirstTile?.effects;
      const spanFxColor = spanFx?.border || null;
      if (spanFxColor && /^#[0-9a-fA-F]{6}$/.test(spanFxColor)) {
        const sfr = parseInt(spanFxColor.slice(1, 3), 16);
        const sfg = parseInt(spanFxColor.slice(3, 5), 16);
        const sfb = parseInt(spanFxColor.slice(5, 7), 16);
        if (spanFx.glow) {
          const ga = 0.18 + 0.10 * pulse;
          ctx.fillStyle = `rgba(${sfr},${sfg},${sfb},${ga.toFixed(3)})`;
          ctx.fillRect(sx - 6, sy - 6, sw + 12, sh + 12);
          ctx.fillStyle = `rgba(${sfr},${sfg},${sfb},${(ga * 0.6).toFixed(3)})`;
          ctx.fillRect(sx - 3, sy - 3, sw + 6, sh + 6);
        }
        const ba = 0.85 + 0.15 * pulse;
        ctx.strokeStyle = `rgba(${sfr},${sfg},${sfb},${ba.toFixed(3)})`;
        ctx.lineWidth = Math.max(2, 3 / cam.zoom);
        ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      } else {
        // Default outer span border
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2 / cam.zoom;
        ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      }

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

      // Per-tile effects + hover/selected/fly-to highlights on individual span tiles
      for (const tid of tileIds) {
        const tc = tid % GRID_SIZE;
        const tr = Math.floor(tid / GRID_SIZE);
        const tx = tc * TILE_SIZE;
        const ty = tr * TILE_SIZE;

        // (Span-level effects now rendered on the whole span rectangle above)

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

    // Block tiles feature removed

    // Always draw claimed tiles first (fast: only iterate tiles with data)
    const tileBorders = []; // Collect borders to batch-stroke after tile loop
    const deferredBadges = []; // Collect badges to render above all tiles
    const claimedIds = Object.keys(tiles);
    for (let ci = 0; ci < claimedIds.length; ci++) {
      const id = Number(claimedIds[ci]);
      const row = Math.floor(id / GRID_SIZE);
      const col = id % GRID_SIZE;
      if (row < minRow || row > maxRow || col < minCol || col > maxCol) continue;
      const tile = tiles[id];
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;

        // Skip tiles that belong to a rendered span — span already drew the image + glow
        if (tilesInSpans.has(id)) continue;

        if (tile) {
          const baseColor = tile.color || CATEGORY_COLORS[tile.category] || '#333';
          const tileMatches = !isFilterActive || tileMatchesFilter(tile, searchQuery, categoryFilter);

          ctx.save();
          if (!tileMatches) ctx.globalAlpha = 0.25;

          // ── Custom tile effects (border color + glow) ──
          if (tile.effects) {
            const fx = tile.effects;
            const fxColor = fx.border || null;
            if (fxColor && /^#[0-9a-fA-F]{6}$/.test(fxColor)) {
              const fr = parseInt(fxColor.slice(1, 3), 16);
              const fg = parseInt(fxColor.slice(3, 5), 16);
              const fb = parseInt(fxColor.slice(5, 7), 16);
              // Glow halo
              if (fx.glow) {
                const ga = 0.18 + 0.10 * pulse;
                ctx.fillStyle = `rgba(${fr},${fg},${fb},${ga.toFixed(3)})`;
                ctx.fillRect(x - 4, y - 4, TILE_SIZE + 8, TILE_SIZE + 8);
                ctx.fillStyle = `rgba(${fr},${fg},${fb},${(ga * 0.6).toFixed(3)})`;
                ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
              }
              // Custom border
              const ba = 0.85 + 0.15 * pulse;
              ctx.strokeStyle = `rgba(${fr},${fg},${fb},${ba.toFixed(3)})`;
              ctx.lineWidth = Math.max(1, 2 / cam.zoom);
              ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            }
          }

          // ── Alliance border glow (below rep/heartbeat glow) ──
          if (alliances && alliances[id]) {
            const allianceColor = alliances[id].color || '#888888';
            // Parse hex color to rgba
            const r = parseInt(allianceColor.slice(1, 3), 16);
            const g = parseInt(allianceColor.slice(3, 5), 16);
            const b = parseInt(allianceColor.slice(5, 7), 16);
            const a = 0.3 + 0.15 * pulse;
            ctx.strokeStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
            ctx.lineWidth = 2 / cam.zoom;
            ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            // Subtle inner fill
            ctx.fillStyle = `rgba(${r},${g},${b},0.06)`;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }

          // ── Reputation glow halo (subtle, below heartbeat glow) ──
          if (tile.repScore != null && tile.repScore > 0) {
            const rep = tile.repScore;
            if (rep >= 80) {
              // High rep: bright golden halo
              ctx.fillStyle = 'rgba(251,191,36,0.10)';
              ctx.fillRect(x - 5, y - 5, TILE_SIZE + 10, TILE_SIZE + 10);
              ctx.fillStyle = 'rgba(251,191,36,0.06)';
              ctx.fillRect(x - 3, y - 3, TILE_SIZE + 6, TILE_SIZE + 6);
            } else if (rep >= 50) {
              // Mid rep: dim purple halo
              ctx.fillStyle = 'rgba(167,139,250,0.07)';
              ctx.fillRect(x - 3, y - 3, TILE_SIZE + 6, TILE_SIZE + 6);
            } else if (rep >= 20) {
              // Low rep: very faint blue
              ctx.fillStyle = 'rgba(99,179,237,0.05)';
              ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
            }
          }

          // ── Heartbeat glow halo (non-span tiles only) ──
          if (tile.status === 'online') {
            const a = 0.06 + 0.08 * pulse;
            ctx.fillStyle = `rgba(34,197,94,${a.toFixed(3)})`;
            ctx.fillRect(x - 4, y - 4, TILE_SIZE + 8, TILE_SIZE + 8);
            ctx.fillStyle = `rgba(34,197,94,${(a * 1.5).toFixed(3)})`;
            ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
          } else if (tile.lastHeartbeat) {
            const age = now - tile.lastHeartbeat;
            if (age <= HB_YELLOW) {
              ctx.fillStyle = 'rgba(234,179,8,0.04)';
              ctx.fillRect(x - 2, y - 2, TILE_SIZE + 4, TILE_SIZE + 4);
            }
          }

          // Try to draw image first (no clip — draw at exact tile bounds)
          // Use HD (256px) thumbs when zoomed in enough that tiles are >100px on screen
          const useHD = cam.zoom > 0.5;
          const tier = useHD ? 'hd' : 'sd';
          let cachedImg = tile.imageUrl ? imageCache[`thumb:${tier}:${tile.id}:${tile.imageUrl}`] : null;
          // If HD requested but not loaded yet, fall back to SD for instant display
          if (useHD && (!cachedImg || cachedImg === 'loading') && tile.imageUrl) {
            const sdImg = imageCache[`thumb:sd:${tile.id}:${tile.imageUrl}`];
            if (sdImg && sdImg !== 'loading' && sdImg !== 'error') cachedImg = sdImg;
          }
          // Trigger HD load on demand when zoomed in
          if (useHD && tile.imageUrl && !imageCache[`thumb:hd:${tile.id}:${tile.imageUrl}`]) {
            loadTileImage(tile, true);
          }
          if (cachedImg && cachedImg !== 'loading' && cachedImg !== 'error') {
            ctx.drawImage(cachedImg, x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          } else {
            // Colored background + emoji
            ctx.fillStyle = baseColor;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

            if (cam.zoom > 0.2) {
              const emoji = tile.avatar || '🤖';
              const emojiSize = Math.min(20, TILE_SIZE * 0.5);
              ctx.font = `${emojiSize}px system-ui`;
              // Draw emoji as image via offscreen canvas for pixel-perfect centering
              // Render at high res: 4x base × devicePixelRatio for Retina crispness
              const dpr = window.devicePixelRatio || 1;
              const renderScale = 4 * dpr;
              const renderSize = emojiSize * renderScale;
              const eCacheKey = emoji + ':' + emojiSize + ':' + dpr;
              let eBmp = imageCache[eCacheKey];
              if (!eBmp) {
                imageCache[eCacheKey] = 'loading';
                const eCanvas = document.createElement('canvas');
                const pad = Math.ceil(renderSize * 0.3);
                const eW = Math.ceil(renderSize * 2) + pad * 2;
                eCanvas.width = eW; eCanvas.height = eW;
                const eCtx = eCanvas.getContext('2d');
                eCtx.font = `${renderSize}px system-ui`;
                eCtx.textAlign = 'center';
                eCtx.textBaseline = 'middle';
                eCtx.fillText(emoji, eW / 2, eW / 2);
                // Scan for actual pixel bounds
                const imgData = eCtx.getImageData(0, 0, eW, eW).data;
                let minX = eW, maxX = 0, minY = eW, maxY = 0;
                for (let py = 0; py < eW; py++) {
                  for (let px = 0; px < eW; px++) {
                    if (imgData[(py * eW + px) * 4 + 3] > 10) {
                      if (px < minX) minX = px;
                      if (px > maxX) maxX = px;
                      if (py < minY) minY = py;
                      if (py > maxY) maxY = py;
                    }
                  }
                }
                if (maxX >= minX && maxY >= minY) {
                  const cw = maxX - minX + 1, ch = maxY - minY + 1;
                  const cropCanvas = document.createElement('canvas');
                  cropCanvas.width = cw; cropCanvas.height = ch;
                  cropCanvas.getContext('2d').drawImage(eCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
                  createImageBitmap(cropCanvas).then(bmp => { imageCache[eCacheKey] = bmp; });
                } else {
                  imageCache[eCacheKey] = 'error';
                }
              } else if (eBmp !== 'loading' && eBmp !== 'error') {
                const drawW = eBmp.width;
                const drawH = eBmp.height;
                const maxDim = TILE_SIZE * 0.7;
                const scale = Math.min(maxDim / drawW, maxDim / drawH, 1);
                const sw = drawW * scale, sh = drawH * scale;
                ctx.drawImage(eBmp, x + (TILE_SIZE - sw) / 2, y + (TILE_SIZE - sh) / 2, sw, sh);
              }
            }
          }

          // Border (collected for batch stroke below)
          tileBorders.push({ x: x + 1, y: y + 1, w: TILE_SIZE - 2, h: TILE_SIZE - 2, color: baseColor });

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

          // — Trophy badge for challenge winners —
          if (tile?.hasTrophy && cam.zoom > 0.15) {
            const tr = Math.max(5, TILE_SIZE * 0.2);
            const tx = x + TILE_SIZE * 0.5;
            const ty = y + tr * 0.6;
            ctx.font = `${Math.round(tr * 1.8)}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🏆', tx, ty);
          }

          // — Crack animation for challenge losers (1h) —
          if (tile?.hasCrack && cam.zoom > 0.08) {
            const cx = x, cy = y, cw = TILE_SIZE, ch = TILE_SIZE;
            const crackAlpha = 0.55 + 0.15 * Math.sin(Date.now() / 600);
            ctx.save();
            ctx.globalAlpha = crackAlpha;
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = Math.max(0.5, 1.5 / cam.zoom);
            ctx.beginPath();
            // Main crack line — diagonal
            ctx.moveTo(cx + cw * 0.25, cy + ch * 0.1);
            ctx.lineTo(cx + cw * 0.55, cy + ch * 0.45);
            ctx.lineTo(cx + cw * 0.4, cy + ch * 0.65);
            ctx.lineTo(cx + cw * 0.7, cy + ch * 0.9);
            // Branch crack
            ctx.moveTo(cx + cw * 0.55, cy + ch * 0.45);
            ctx.lineTo(cx + cw * 0.8, cy + ch * 0.35);
            ctx.stroke();
            // Red tint overlay
            ctx.globalAlpha = 0.08 + 0.04 * Math.sin(Date.now() / 400);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(cx, cy, cw, ch);
            ctx.restore();
          }

          // Collect badges for deferred rendering (above all tiles)
          const pendingCount = pendingRequestsRef.current[id];
          if (pendingCount > 0 && cam.zoom > 0.15) {
            deferredBadges.push({ type: 'pending', x, y, count: pendingCount });
          }
          if (bountyTilesRef.current && bountyTilesRef.current[id] && cam.zoom > 0.15) {
            deferredBadges.push({ type: 'bounty', x, y });
          }

          ctx.restore();
        }

        // Tower Defense — invaded tile red glow
        const tdInvasions = tdInvasionsRef.current;
        const isInvaded = FEATURES.TOWER_DEFENSE && Array.isArray(tdInvasions) && tdInvasions.some(inv => inv.tile_id === id);
        if (isInvaded) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
          ctx.save();
          ctx.fillStyle = `rgba(220, 38, 38, ${0.20 + pulse * 0.20})`;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (cam.zoom > 0.15) {
            ctx.strokeStyle = `rgba(220, 38, 38, ${0.6 + pulse * 0.4})`;
            ctx.lineWidth = (2 + pulse * 2) / cam.zoom;
            ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          if (cam.zoom > 0.3) {
            ctx.font = `${Math.max(10, TILE_SIZE * 0.38)}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('👾', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
          }
          ctx.restore();
        }

        // CTF flag pulsing overlay (active flag tile)
        const activeFlagTileId = FEATURES.CTF ? ctfFlagRef.current?.flagTileId : null;
        if (activeFlagTileId === id) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
          ctx.save();
          ctx.fillStyle = `rgba(239, 68, 68, ${0.25 + pulse * 0.25})`;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (cam.zoom > 0.15) {
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.7 + pulse * 0.3})`;
            ctx.lineWidth = (2 + pulse * 2) / cam.zoom;
            ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          if (cam.zoom > 0.3) {
            ctx.font = `${Math.max(10, TILE_SIZE * 0.4)}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('🚩', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
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

    // Batch-stroke tile borders — skip during animation (subpixel at low zoom, invisible)
    const isAnimating = !!(introAnimRef.current || flyToAnimRef.current);
    if (tileBorders.length > 0 && !isAnimating) {
      const byColor = {};
      for (const b of tileBorders) {
        (byColor[b.color] || (byColor[b.color] = [])).push(b);
      }
      ctx.lineWidth = 1.5 / cam.zoom;
      for (const color in byColor) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (const b of byColor[color]) {
          ctx.rect(b.x, b.y, b.w, b.h);
        }
        ctx.stroke();
      }
    }

    // Deferred badge rendering — drawn above all tiles so they're never clipped
    for (const badge of deferredBadges) {
      if (badge.type === 'pending') {
        const badgeR = Math.max(6, TILE_SIZE * 0.22);
        const bx = badge.x + TILE_SIZE - badgeR * 0.5;
        const by = badge.y + badgeR * 0.5;
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
          ctx.fillText(String(badge.count), bx, by + 0.5);
        }
      } else if (badge.type === 'bounty') {
        const badgeR = Math.max(5, TILE_SIZE * 0.18);
        const bx = badge.x + badgeR * 0.5;
        const by = badge.y + TILE_SIZE - badgeR * 0.5;
        ctx.beginPath();
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5 / cam.zoom;
        ctx.stroke();
        if (cam.zoom > 0.5) {
          ctx.fillStyle = '#000';
          ctx.font = `bold ${Math.round(badgeR * 1.0)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', bx, by + 0.5);
        }
      }
    }

    // Empty cell hover/selection highlights (only when zoomed in enough to see cells)
    if (visibleCells < 5000) {
      const hasDrag = dragSelectedTiles.current.size > 0;
      const hasBatch = batchTilesRef.current && batchTilesRef.current.length > 0;
      if (hoveredTile != null || hasDrag || hasBatch) {
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const id = row * GRID_SIZE + col;
            if (tiles[id]) continue; // already handled in claimed loop
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            const inBatch = hasBatch && batchTilesRef.current.includes(id);
            const inDrag = hasDrag && dragSelectedTiles.current.has(id);
            if (inBatch || inDrag) {
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 2.5 / cam.zoom;
              ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
              ctx.fillStyle = 'rgba(59,130,246,0.2)';
              ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            }
            if (hoveredTile === id && !inDrag) {
              ctx.fillStyle = 'rgba(59,130,246,0.08)';
              ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 2 / cam.zoom;
              ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      }
    }

    // Heat map feature removed

    // ── Pixel Wars paint overlay ──────────────────────────────────────────
    // Render color wash on unclaimed tiles that have been pixel-war painted
    const pwMap = FEATURES.PIXEL_WARS ? pixelWarsRef.current : {};
    const pwChampions = pixelWarsChampionsRef.current;
    if (pwMap && Object.keys(pwMap).length > 0) {
      for (const [tileIdStr, paint] of Object.entries(pwMap)) {
        const tid = Number(tileIdStr);
        if (tiles[tid]) continue; // skip claimed tiles
        const row = Math.floor(tid / GRID_SIZE);
        const col = tid % GRID_SIZE;
        if (row < minRow || row > maxRow || col < minCol || col > maxCol) continue;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        // Parse hex color
        const hex = paint.color || '#888888';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        // Animated alpha pulse (fades in and out subtly)
        const alpha = 0.35 + 0.1 * Math.sin(Date.now() / 800 + tid * 0.05);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        // Small paint splash marker in corner when zoomed in
        if (cam.zoom > 0.25) {
          ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
          const splashR = Math.max(3, TILE_SIZE * 0.15);
          ctx.beginPath();
          ctx.arc(x + splashR, y + TILE_SIZE - splashR, splashR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Champion badge on claimed tiles
    if (pwChampions && pwChampions.size > 0 && cam.zoom > 0.15) {
      for (const tid of pwChampions) {
        const tile = tiles[tid];
        if (!tile) continue;
        const row = Math.floor(tid / GRID_SIZE);
        const col = tid % GRID_SIZE;
        if (row < minRow || row > maxRow || col < minCol || col > maxCol) continue;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const badgeR = Math.max(6, TILE_SIZE * 0.2);
        // Bottom-right corner: 🎨 badge
        ctx.font = `${Math.round(badgeR * 1.6)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎨', x + TILE_SIZE - badgeR, y + TILE_SIZE - badgeR);
      }
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

    // Grid border with animated glow
    const t = Date.now() / 1000;
    const borderPulse = 0.5 + 0.5 * Math.sin(t * 1.6); // doubled frequency (1.6 rad/s ≈ 0.25 Hz)
    const glowSize = (30 + 15 * Math.sin(t * 1.6)) / cam.zoom;
    ctx.save();
    // Outer wide glow
    ctx.shadowColor = `rgba(59, 130, 246, ${0.7 * borderPulse})`;
    ctx.shadowBlur = glowSize;
    ctx.strokeStyle = `rgba(59, 130, 246, ${0.6 * borderPulse})`;
    ctx.lineWidth = 4 / cam.zoom;
    ctx.strokeRect(0, 0, GRID_PX, GRID_PX);
    // Mid glow pass
    ctx.shadowBlur = glowSize * 1.5;
    ctx.shadowColor = `rgba(99, 160, 255, ${0.5 * borderPulse})`;
    ctx.strokeStyle = `rgba(99, 160, 255, ${0.35 * borderPulse})`;
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(0, 0, GRID_PX, GRID_PX);
    // Bright inner edge
    ctx.shadowBlur = glowSize * 0.4;
    ctx.shadowColor = `rgba(180, 210, 255, ${0.6 * borderPulse})`;
    ctx.strokeStyle = `rgba(180, 210, 255, ${0.4 * borderPulse})`;
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.strokeRect(0, 0, GRID_PX, GRID_PX);
    ctx.restore();

    // — Action animations (flying emoji between tiles) —
    const animNow = Date.now();
    const anims = activeAnimationsRef.current;
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const elapsed = animNow - a.startTime;
      const t = Math.min(elapsed / a.duration, 1);
      if (t >= 1) { anims.splice(i, 1); continue; }

      if (a.actionType === 'emote') {
        // Emote: big emoji pops up from tile, floats high, sways, fades
        const floatHeight = 200 / cam.zoom; // float a long way up
        const floatY = a.endY - floatHeight * t;
        const sway = Math.sin(t * Math.PI * 4) * 15 / cam.zoom;
        // Pop in fast, hold, fade out
        const alpha = t < 0.1 ? t / 0.1 : t > 0.6 ? (1 - t) / 0.4 : 1;
        // Start big, settle, then shrink as it fades
        const popScale = t < 0.15 ? 1.8 - 0.8 * (t / 0.15) : 1.0;
        const fontSize = (56 * popScale) / cam.zoom;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(a.endX + sway, floatY);
        // Slight rotation sway
        ctx.rotate(Math.sin(t * Math.PI * 3) * 0.15);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Warm glow
        ctx.shadowColor = 'rgba(255,180,50,0.8)';
        ctx.shadowBlur = 20 / cam.zoom;
        ctx.fillText(a.emoji, 0, 0);
        // Second pass for stronger glow
        ctx.shadowColor = 'rgba(255,100,50,0.4)';
        ctx.shadowBlur = 40 / cam.zoom;
        ctx.fillText(a.emoji, 0, 0);
        ctx.restore();
      } else {
        // Action: arc trajectory from source to target
        const ease = 1 - Math.pow(1 - t, 3);
        const x = a.startX + (a.endX - a.startX) * ease;
        const y = a.startY + (a.endY - a.startY) * ease;
        const arcHeight = Math.abs(a.endX - a.startX + a.endY - a.startY) * 0.3;
        const arcY = y - Math.sin(t * Math.PI) * arcHeight;

        const scale = (t < 0.3 ? t / 0.3 : t > 0.7 ? (1 - t) / 0.3 : 1) * 1.5;
        const fontSize = Math.max(24, 48 * scale) / cam.zoom;
        const rot = a.actionType === 'slap' ? Math.sin(t * Math.PI * 6) * 0.3 : 0;

        ctx.save();
        ctx.translate(x, arcY);
        ctx.rotate(rot);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 10 / cam.zoom;
        ctx.fillText(a.emoji, 0, 0);
        ctx.restore();

        // Impact flash
        if (t > 0.85) {
          const flashAlpha = (t - 0.85) / 0.15;
          const flashR = (40 + 30 * flashAlpha) / cam.zoom;
          ctx.save();
          ctx.beginPath();
          ctx.arc(a.endX, a.endY, flashR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 200, ${0.4 * (1 - flashAlpha)})`;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }, [tiles, hoveredTile, selectedTile, viewMode, searchQuery, categoryFilter]); // camera via ref, connections via ref

  // Animation loop for pulsing glow
  useEffect(() => {
    if (viewMode === 'list') return;
    let frame;
    let lastT = 0;
    const loop = (t) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      pulsePhase.current += dt * 2.5; // ~2.5 rad/sec

      // Drive intro animation from this single rAF loop (no separate chain)
      const ia = introAnimRef.current;
      if (ia) {
        if (ia.startTime === null) ia.startTime = t;
        const elapsed = t - ia.startTime;
        const p = Math.min(1, elapsed / ia.duration);
        const e = ia.ease(p);
        cameraRef.current = {
          x: ia.startX + (ia.targetX - ia.startX) * e,
          y: ia.startY + (ia.targetY - ia.startY) * e,
          zoom: ia.startZoom * Math.pow(ia.targetZoom / ia.startZoom, e),
        };
        if (p >= 1) {
          introAnimRef.current = null;
          introFinished.current = true;
          setCamera(cameraRef.current);
          if (onIntroFinished) onIntroFinished();
        }
      }

      // Drive fly-to animation
      const fa = flyToAnimRef.current;
      if (fa) {
        if (fa.startTime === null) fa.startTime = t; // lazy init on first frame
        const elapsed = t - fa.startTime;
        const p = Math.min(1, elapsed / fa.duration);
        const e = fa.ease(p);
        let z;
        if (p < 0.4) {
          z = fa.startZoom + (fa.midZoom - fa.startZoom) * (p / 0.4);
        } else {
          z = fa.midZoom + (fa.targetZoom - fa.midZoom) * fa.ease((p - 0.4) / 0.6);
        }
        const dx = fa.targetX - fa.startX;
        const dy = fa.targetY - fa.startY;
        const arcStrength = fa.dist * 0.08;
        const arcT = Math.sin(e * Math.PI);
        const perpX = -dy / (fa.dist || 1) * arcStrength * arcT;
        const perpY = dx / (fa.dist || 1) * arcStrength * arcT;
        cameraRef.current = {
          x: fa.startX + dx * e + perpX,
          y: fa.startY + dy * e + perpY,
          zoom: z,
        };
        if (p >= 1) {
          flyToAnimRef.current = null;
          setCamera(cameraRef.current);
        }
      }

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

  // Global mouseup — catches releases outside canvas/window
  useEffect(() => {
    const globalUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        isSelecting.current = false;
        setIsPanning(false);
        setSelectionRect(null);
        dragSelectedTiles.current = new Set();
      }
    };
    window.addEventListener('mouseup', globalUp);
    return () => window.removeEventListener('mouseup', globalUp);
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
  const [shiftDown, setShiftDown] = useState(false); // reactive state for cursor
  const effectiveTool = useCallback(() => shiftHeld.current ? 'select' : tool, [tool]);

  // Track shift key globally + reset on blur (prevents stuck shift)
  useEffect(() => {
    const down = (e) => { if (e.key === 'Shift') { shiftHeld.current = true; setShiftDown(true); } };
    const up = (e) => { if (e.key === 'Shift') { shiftHeld.current = false; setShiftDown(false); } };
    const blur = () => {
      shiftHeld.current = false;
      setShiftDown(false);
      if (isDragging.current) {
        isDragging.current = false;
        isSelecting.current = false;
        setIsPanning(false);
        setSelectionRect(null);
        dragSelectedTiles.current = new Set();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
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
      setIsPanning(false);
      selectStart.current = { ...px, sx: e.clientX, sy: e.clientY };
      selectEnd.current = { ...px };
    } else {
      isSelecting.current = false;
      selectStart.current = null;
      setIsPanning(true);
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
    setIsPanning(false);
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
    return <ListView tiles={tiles} searchQuery={searchQuery} categoryFilter={categoryFilter} onTileClick={onTileClick} selectedTile={selectedTile} />;
  }

  // ─── Canvas grid view ────────────────────────────────────────────────────
  return (
    <>
      <div ref={containerRef} className={`flex-1 overflow-hidden relative ${(tool === 'select' || shiftDown) ? 'cursor-pixel-cross' : isPanning ? 'cursor-pixel-grabbing' : 'cursor-pixel-grab'}`}>
        <canvas
          id="grid-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isDragging.current = false; isSelecting.current = false; setIsPanning(false); setHoveredTile(null); setSelectionRect(null); dragSelectedTiles.current = new Set(); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
            if (tileId === null) return;
            // Block claim feature removed — right-click does nothing
          }}
          className="block h-full w-full"
        />

        {/* Drag-select overlay — outline only, no fill */}
        {selectionRect && (
          <SelectionOverlay selectionRect={selectionRect} />
        )}

        {hoveredTile !== null && tiles[hoveredTile] && !selectionRect && (
          <TileTooltip tile={tiles[hoveredTile]} hoveredTile={hoveredTile} />
        )}

        {/* Drag-select hint */}
        {selectionRect && (
          <SelectionOverlay hintOnly />
        )}

        {/* ── Desktop tool toggle (bottom-right) ── */}
        <ToolToggle tool={tool} onToolChange={setTool} />

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
