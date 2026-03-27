'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import BatchClaimModal from './BatchClaimModal';

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
  const cacheKey = `${tile.id}:64`;
  if (imageCache[cacheKey]) return imageCache[cacheKey];
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

export default function Grid({ tiles, connections, onConnectionsChange, onTileClick, selectedTile, zoom, onZoomChange, viewMode, searchQuery, categoryFilter }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const containerRef = useRef(null);
  const [camera, setCamera] = useState({ x: GRID_PX / 2, y: GRID_PX / 2, zoom: zoom || 1.5 });
  const [hoveredTile, setHoveredTile] = useState(null);
  const [batchTiles, setBatchTiles] = useState(null); // array of tile IDs for batch modal

  // Drag/pan state
  const isDragging = useRef(false);
  const dragMoved = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Drag-select state
  const isSelecting = useRef(false);
  const selectStart = useRef(null); // { gridX, gridY } in canvas coords
  const selectEnd = useRef(null);
  const [selectionRect, setSelectionRect] = useState(null); // { x1,y1,x2,y2 } in screen

  // Animation frame for pulsing glow
  const animFrame = useRef(null);
  const pulsePhase = useRef(0);

  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // Connections ref (kept in sync with prop for draw callback)
  const connectionsRef = useRef(connections || []);
  useEffect(() => { connectionsRef.current = connections || []; }, [connections]);

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

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

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
      ctx.strokeStyle = '#111122';
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

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const id = row * GRID_SIZE + col;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const tile = tiles[id];

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
          const cachedImg = tile.imageUrl ? imageCache[`${tile.id}:64`] : null;
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

          // Status dot
          const statusColor = tile.status === 'online' ? '#22c55e' : tile.status === 'busy' ? '#f59e0b' : '#ef4444';
          const dotR = Math.max(2, 3 / cam.zoom);
          ctx.fillStyle = statusColor;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE - 5, y + 5, dotR, 0, Math.PI * 2);
          ctx.fill();

          // Social verification badges on tile canvas
          if (cam.zoom > 0.35) {
            const badges = [
              { label: 'G', verified: Boolean(tile.githubVerified) },
              { label: 'X', verified: Boolean(tile.xVerified) },
            ];
            const badgeSize = Math.max(7, 8 / cam.zoom);
            const badgeGap = Math.max(1.5, 2 / cam.zoom);
            const badgeY = y + TILE_SIZE - badgeSize - Math.max(2, 2 / cam.zoom);
            let badgeX = x + Math.max(2, 2 / cam.zoom);

            for (const badge of badges) {
              ctx.save();
              ctx.fillStyle = badge.verified ? '#22c55e' : '#6b7280';
              ctx.strokeStyle = 'rgba(10,10,15,0.9)';
              ctx.lineWidth = 1 / cam.zoom;
              ctx.beginPath();
              ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 2 / cam.zoom);
              ctx.fill();
              ctx.stroke();
              if (cam.zoom > 0.35) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(5, 5.5 / cam.zoom)}px system-ui`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(badge.label, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 0.2 / cam.zoom);
              }
              ctx.restore();
              badgeX += badgeSize + badgeGap;
            }
          }

          // Name (only when zoomed in)
          if (cam.zoom > 0.5) {
            ctx.font = `bold ${Math.min(8, TILE_SIZE * 0.18)}px system-ui`;
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = tileMatches ? 0.9 : 0.25 * 0.9;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(tile.name?.substring(0, 12) || '', x + TILE_SIZE / 2, y + TILE_SIZE - 2);
          }

          // Highlight selected
          if (selectedTile === id) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3 / cam.zoom;
            ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          }

          ctx.restore();
        }

        // Hover highlight
        if (hoveredTile === id) {
          ctx.fillStyle = tile ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.08)';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = tile ? '#fff' : '#3b82f6';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
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

    // Grid border
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2 / cam.zoom;
    ctx.strokeRect(0, 0, GRID_PX, GRID_PX);

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

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = screenToGridPx(e.clientX - rect.left, e.clientY - rect.top);
    if (!px) return;

    isDragging.current = true;
    dragMoved.current = false;
    isSelecting.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    selectStart.current = { ...px, sx: e.clientX, sy: e.clientY };
    selectEnd.current = { ...px };
  }, [screenToGridPx]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    setHoveredTile(tileId);

    if (isDragging.current && selectStart.current) {
      const dx = e.clientX - selectStart.current.sx;
      const dy = e.clientY - selectStart.current.sy;
      const dist = Math.hypot(dx, dy);

      if (dist > 5 && !dragMoved.current) {
        // Check if this is a selection drag (button 0, no special key)
        // We treat it as selection drag if we haven't panned yet
        isSelecting.current = true;
      }

      if (isSelecting.current) {
        // Selection drag: track end point
        const px = screenToGridPx(e.clientX - rect.left, e.clientY - rect.top);
        if (px) selectEnd.current = px;
        // Update overlay rect in screen coords
        setSelectionRect({
          x1: Math.min(selectStart.current.sx, e.clientX) - rect.left,
          y1: Math.min(selectStart.current.sy, e.clientY) - rect.top,
          x2: Math.max(selectStart.current.sx, e.clientX) - rect.left,
          y2: Math.max(selectStart.current.sy, e.clientY) - rect.top,
        });
      } else {
        // Pan drag
        if (dist > 2) dragMoved.current = true;
        const panDx = e.clientX - lastMouse.current.x;
        const panDy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setCamera(prev => ({
          ...prev,
          x: prev.x - panDx / prev.zoom,
          y: prev.y - panDy / prev.zoom,
        }));
      }
    }
  }, [screenToGrid, screenToGridPx]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setSelectionRect(null);

    if (isSelecting.current && selectStart.current && selectEnd.current) {
      // Compute tiles in selection rectangle
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
        for (let r = row1; r <= row2; r++) {
          for (let c = col1; c <= col2; c++) {
            selected.push(r * GRID_SIZE + c);
          }
        }
        if (selected.length > 1) {
          setBatchTiles(selected);
          return;
        } else if (selected.length === 1) {
          onTileClick(selected[0]);
          return;
        }
      }
    } else if (!dragMoved.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const tileId = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      if (tileId !== null) onTileClick(tileId);
    }

    isSelecting.current = false;
    selectStart.current = null;
    selectEnd.current = null;
  }, [screenToGrid, onTileClick]);

  // Touch support
  const lastTouchDist = useRef(null);
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      isDragging.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    } else {
      isDragging.current = true;
      dragMoved.current = false;
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      setCamera(prev => {
        const newZoom = Math.max(0.02, Math.min(8, prev.zoom * factor));
        if (onZoomChange) onZoomChange(newZoom);
        return { ...prev, zoom: newZoom };
      });
    } else if (e.touches.length === 1 && isDragging.current) {
      const dx = e.touches[0].clientX - lastMouse.current.x;
      const dy = e.touches[0].clientY - lastMouse.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setCamera(prev => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
    }
  }, [onZoomChange]);

  const handleTouchEnd = useCallback((e) => {
    // If single-finger lift with no pan → treat as tap (tile select)
    if (e.changedTouches.length === 1 && !dragMoved.current) {
      const touch = e.changedTouches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const tileId = screenToGrid(touch.clientX - rect.left, touch.clientY - rect.top);
        if (tileId !== null) onTileClick(tileId);
      }
    }
    isDragging.current = false;
    dragMoved.current = false;
    lastTouchDist.current = null;
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
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: isSelecting.current ? 'crosshair' : (isDragging.current ? 'grabbing' : 'grab') }}>
        <canvas
          id="grid-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isDragging.current = false; isSelecting.current = false; setHoveredTile(null); setSelectionRect(null); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Drag-select overlay rectangle */}
        {selectionRect && (
          <div style={{
            position: 'absolute',
            left: selectionRect.x1,
            top: selectionRect.y1,
            width: selectionRect.x2 - selectionRect.x1,
            height: selectionRect.y2 - selectionRect.y1,
            border: '2px solid rgba(59,130,246,0.8)',
            background: 'rgba(59,130,246,0.12)',
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
      </div>

      {/* Batch claim modal */}
      {batchTiles && (
        <BatchClaimModal
          tileIds={batchTiles}
          tiles={tiles}
          onClose={() => setBatchTiles(null)}
        />
      )}
    </>
  );
}
