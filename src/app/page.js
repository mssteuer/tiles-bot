'use client';


import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Grid from '../components/Grid';
import TilePanel from '../components/TilePanel';
import Header from '../components/Header';
import FilterBar from '../components/FilterBar';
import ClaimModal from '../components/ClaimModal';
import BlockClaimModal from '../components/BlockClaimModal';


const GRID_PX = 256 * 32;
const DEFAULT_ZOOM = 1.5; // zoom in to see tiles clearly (each tile ≈ 48px at 1.5x)





async function fetchGrid() {
  const res = await fetch('/api/grid');
  if (!res.ok) return null;
  return res.json();
}

async function fetchStatsSnapshot() {
  const res = await fetch('/api/stats');
  if (!res.ok) return null;
  return res.json();
}

async function fetchConnections() {
  try {
    const res = await fetch('/api/connections');
    if (!res.ok) return [];
    const data = await res.json();
    return data.connections || [];
  } catch {
    return [];
  }
}

async function fetchBlocks() {
  try {
    const res = await fetch('/api/blocks');
    if (!res.ok) return [];
    const data = await res.json();
    return data.blocks || [];
  } catch {
    return [];
  }
}

function HomeInner() {
  const searchParams = useSearchParams();
  const [tiles, setTiles] = useState({});
  const [pendingRequests, setPendingRequests] = useState({});
  const [connections, setConnections] = useState([]);
  // Pre-select tile from ?tile=<id> query param (used by /tiles/:id redirect)
  const [selectedTile, setSelectedTile] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tile');
      const n = p !== null ? parseInt(p, 10) : null;
      return Number.isInteger(n) && n >= 0 && n < 65536 ? n : null;
    }
    return null;
  });
  const [blocks, setBlocks] = useState([]);
  const [blockClaimTopLeft, setBlockClaimTopLeft] = useState(null);
  const [stats, setStats] = useState({ claimed: 0, total: 65536, currentPrice: 1.0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [claimModalTile, setClaimModalTile] = useState(null);
  const [nextAvailableTileId, setNextAvailableTileId] = useState(0);

  // Sync ?tile= query param → selectedTile (handles client-side navigation)
  useEffect(() => {
    const tileParam = searchParams ? searchParams.get('tile') : null;
    if (tileParam !== null) {
      const n = parseInt(tileParam, 10);
      if (Number.isInteger(n) && n >= 0 && n < 65536) {
        setSelectedTile(n);
      }
    }
  }, [searchParams]);

  // SSE: real-time tile updates — re-sync on (re)connect and patch local grid on claim events
  useEffect(() => {
    let closed = false;

    async function refreshGridAndStats() {
      const [grid, statsSnapshot, conns, blockList] = await Promise.all([fetchGrid(), fetchStatsSnapshot(), fetchConnections(), fetchBlocks()]);
      if (closed) return;

      if (grid) {
        setTiles(grid.tiles);
        if (grid.blocks) setBlocks(grid.blocks);
      }

      setBlocks(prev => blockList.length ? blockList : prev);
      setConnections(conns);

      const nextStats = statsSnapshot || grid?.stats;
      if (nextStats) {
        setStats(nextStats);
        if (nextStats.nextAvailableTileId != null) {
          setNextAvailableTileId(nextStats.nextAvailableTileId);
        }
      }
    }

    const es = new EventSource('/api/events');

    es.onopen = () => {
      refreshGridAndStats();
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'block_claimed') {
          fetchBlocks().then(bl => setBlocks(bl));
        } else if (event.type === 'tile_claimed') {
          setTiles(prev => ({ ...prev, [event.tileId]: event.tile }));
          setStats(prev => {
            const claimed = event.claimedCount ?? (prev.claimed + 1);
            return {
              ...prev,
              claimed,
              currentPrice: event.currentPrice ?? prev.currentPrice,
              nextAvailableTileId: event.nextAvailableTileId ?? prev.nextAvailableTileId,
              recentlyClaimed: event.recentlyClaimed ?? prev.recentlyClaimed,
              topHolders: event.topHolders ?? prev.topHolders,
            };
          });
          if (event.nextAvailableTileId != null) {
            setNextAvailableTileId(event.nextAvailableTileId);
          }
        } else if (event.type === 'connection_request') {
          setPendingRequests(prev => ({
            ...prev,
            [event.toTileId]: (prev[event.toTileId] || 0) + 1,
          }));
        } else if (event.type === 'connection_accepted' || event.type === 'connection_rejected') {
          setPendingRequests(prev => {
            const count = (prev[event.toTileId] || 1) - 1;
            if (count <= 0) { const next = { ...prev }; delete next[event.toTileId]; return next; }
            return { ...prev, [event.toTileId]: count };
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      console.warn('SSE connection error in page.js');
    };

    return () => {
      closed = true;
      es.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [data, blockList0] = await Promise.all([fetchGrid(), fetchBlocks()]);
      if (cancelled || !data) return;

      setTiles(data.tiles);
      if (data.pendingRequests) setPendingRequests(data.pendingRequests);
      setBlocks(data.blocks || blockList0);
      setStats({ ...data.stats });
      if (data.stats.nextAvailableTileId != null) setNextAvailableTileId(data.stats.nextAvailableTileId);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(3, z * 1.3)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(0.03, z / 1.3)), []);
  const handleZoomReset = useCallback(() => setZoom(DEFAULT_ZOOM), []);

  const handleClaimClick = useCallback((tileId) => {
    // If tile is already claimed, just select it; otherwise open claim modal
    if (tiles[tileId]) {
      setSelectedTile(tileId);
    } else {
      setClaimModalTile(tileId ?? null);
    }
  }, [tiles]);

  const handleTileClick = useCallback((tileId) => {
    setSelectedTile(tileId);
    // If unclaimed, open claim modal
    if (!tiles[tileId]) setClaimModalTile(tileId);
  }, [tiles]);

  const panelOpen = selectedTile !== null;

  return (
    <div className="app-shell">
      {claimModalTile !== null && (
        <ClaimModal
          tileId={claimModalTile}
          onClose={() => setClaimModalTile(null)}
          onClaimed={async () => {
            setClaimModalTile(null);
            const data = await fetchGrid();
            if (data) {
              setTiles(data.tiles);
              setStats({ ...data.stats });
            }
          }}
        />
      )}
      {blockClaimTopLeft !== null && (
        <BlockClaimModal
          topLeftId={blockClaimTopLeft}
          tiles={tiles}
          onClose={() => setBlockClaimTopLeft(null)}
          onClaimed={async () => {
            setBlockClaimTopLeft(null);
            const [data, bl] = await Promise.all([fetchGrid(), fetchBlocks()]);
            if (data) { setTiles(data.tiles); setStats({ ...data.stats }); }
            setBlocks(data?.blocks || bl);
          }}
        />
      )}
      <Header stats={stats} onClaimClick={(tileId) => setClaimModalTile(tileId ?? nextAvailableTileId)} nextAvailableTileId={nextAvailableTileId} />
      <FilterBar
        onFilterChange={setFilterCategory}
        onSearchChange={setSearchQuery}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        heatmapMode={heatmapMode}
        onHeatmapToggle={setHeatmapMode}
      />
      <div className="main-content">
        <Grid
          tiles={tiles}
          blocks={blocks}
          connections={connections}
          pendingRequests={pendingRequests}
          onConnectionsChange={setConnections}
          onTileClick={handleTileClick}
          onBlockClaimRequest={setBlockClaimTopLeft}
          selectedTile={selectedTile}
          zoom={zoom}
          onZoomChange={setZoom}
          viewMode={viewMode}
          searchQuery={searchQuery}
          categoryFilter={filterCategory}
          heatmapMode={heatmapMode}
        />
        <div className={`side-panel${panelOpen ? ' open' : ''}`}>
        {panelOpen ? (
          <TilePanel
            tile={tiles[selectedTile] || { id: selectedTile }}
            onClose={() => setSelectedTile(null)}
            onTileUpdated={(id, updatedTile) => {
              setTiles(prev => ({ ...prev, [id]: { ...prev[id], ...updatedTile } }));
            }}
            onConnectionsChange={setConnections}
          />
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
