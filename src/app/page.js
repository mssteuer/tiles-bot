'use client';


import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { initSounds, playSound } from '@/lib/sound';
import { useAccount } from 'wagmi';
import Grid from '../components/Grid';
import TilePanel from '../components/TilePanel';
import Header from '../components/Header';
import FilterBar from '../components/FilterBar';
import ClaimModal from '../components/ClaimModal';
// BlockClaimModal removed — feature killed
import MultiTileSpanModal from '../components/MultiTileSpanModal';
import OnboardingModal from '../components/OnboardingModal';
import ActivityFeed from '../components/ActivityFeed';


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

async function fetchSpans() {
  try {
    const res = await fetch('/api/spans');
    if (!res.ok) return [];
    const data = await res.json();
    return data.spans || [];
  } catch {
    return [];
  }
}

function HomeInner() {
  const searchParams = useSearchParams();
  const { address } = useAccount();
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
  const [spans, setSpans] = useState([]);
  const [alliances, setAlliances] = useState({});
  const [bountyTiles, setBountyTiles] = useState({});
  const [pixelWars, setPixelWars] = useState({});
  const [pixelWarsChampions, setPixelWarsChampions] = useState([]);
  const [flyToTileId, setFlyToTileId] = useState(null);
  const [actionAnimation, setActionAnimation] = useState(null);
  // Intro readiness:
  // - Deep link (?tile=): skip intro, fly to tile
  // - Return from SPA nav: skip intro, restore camera
  // - Already onboarded: intro plays immediately (no wait for modal)
  // - First visit: intro waits for onboarding modal to complete
  const hasDeepLink = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tile');
  const isReturnNav = typeof window !== 'undefined' && !!window.__tiles_camera;
  const alreadyOnboarded = typeof window !== 'undefined' && !!localStorage.getItem('tiles_onboarded');
  const [introReady, setIntroReady] = useState(hasDeepLink || isReturnNav || alreadyOnboarded);
  // blockClaimTopLeft removed — block tiles feature killed
  const [spanClaimTopLeft, setSpanClaimTopLeft] = useState(null);
  const [stats, setStats] = useState({ claimed: 0, total: 65536, currentPrice: 1.0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [claimModalTile, setClaimModalTile] = useState(null);
  const [nextAvailableTileId, setNextAvailableTileId] = useState(null);
  const [activityFeedOpen, setActivityFeedOpen] = useState(true);

  // Sync ?tile= query param → selectedTile + flyTo (handles activity/tile links)
  useEffect(() => {
    const tileParam = searchParams ? searchParams.get('tile') : null;
    if (tileParam !== null) {
      const n = parseInt(tileParam, 10);
      if (Number.isInteger(n) && n >= 0 && n < 65536) {
        setSelectedTile(n);
        setFlyToTileId({ id: n, ts: Date.now() });
      }
    }
  }, [searchParams]);

  // SSE: real-time tile updates — re-sync on (re)connect and patch local grid on claim events
  // Delay SSE connection until intro animation finishes to prevent React DOM thrash during canvas animation
  const [introComplete, setIntroComplete] = useState(false);
  const onIntroFinished = useCallback(() => setIntroComplete(true), []);

  // Safety: connect SSE after 6s even if intro never fires
  useEffect(() => {
    const t = setTimeout(() => setIntroComplete(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!introComplete) return; // Wait for intro animation to finish

    let closed = false;

    async function refreshGridAndStats() {
      const [grid, statsSnapshot, conns, blockList, spanList] = await Promise.all([fetchGrid(), fetchStatsSnapshot(), fetchConnections(), fetchBlocks(), fetchSpans()]);
      if (closed) return;

      if (grid) {
        setTiles(grid.tiles);
        if (grid.blocks) setBlocks(grid.blocks);
        if (grid.spans) setSpans(grid.spans);
        if (grid.alliances) setAlliances(grid.alliances);
        if (grid.bounties) setBountyTiles(grid.bounties);
        if (grid.pixelWars) setPixelWars(grid.pixelWars);
        if (grid.pixelWarsChampions) setPixelWarsChampions(grid.pixelWarsChampions);
      }

      setBlocks(prev => blockList.length ? blockList : prev);
      setSpans(prev => spanList.length ? spanList : prev);
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
        } else if (event.type === 'span_updated') {
          fetchSpans().then(sp => setSpans(sp));
        } else if (event.type === 'tile_image_updated') {
          // Update tile imageUrl so grid renders the image immediately (no refresh needed)
          setTiles(prev => {
            const existing = prev[event.tileId];
            if (!existing) return prev;
            return { ...prev, [event.tileId]: { ...existing, imageUrl: event.imageUrl } };
          });
        } else if (event.type === 'tile_claimed') {
          playSound('claim');
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
        } else if (event.type === 'tile_action') {
          playSound('slap');
          setActionAnimation({
            fromTile: event.fromTile, toTile: event.toTile,
            emoji: event.emoji, actionType: event.actionType, ts: Date.now(),
          });
        } else if (event.type === 'tile_emote') {
          playSound('emote-pop');
          setActionAnimation({
            fromTile: event.fromTile, toTile: event.toTile,
            emoji: event.emoji, actionType: 'emote', ts: Date.now(),
          });
        } else if (event.type === 'pixel_wars_paint') {
          // Update pixel wars map in real-time
          setPixelWars(prev => ({
            ...prev,
            [event.tileId]: { color: event.color, owner: event.ownerName, ownerTile: event.ownerTile, expiresAt: event.expiresAt },
          }));
        } else if (event.type === 'pixel_wars_erase') {
          setPixelWars(prev => {
            const next = { ...prev };
            delete next[event.tileId];
            return next;
          });
        } else if (event.type === 'connection_request') {
          playSound('notification');
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
      const [data, blockList0, spanList0, statsData] = await Promise.all([
        fetchGrid(), fetchBlocks(), fetchSpans(),
        fetch('/api/stats').then(r => r.json()).catch(() => null),
      ]);
      if (cancelled || !data) return;

      setTiles(data.tiles);
      if (data.pendingRequests) setPendingRequests(data.pendingRequests);
      setBlocks(data.blocks || blockList0);
      setSpans(data.spans || spanList0);
      setStats(prev => ({ ...prev, ...data.stats, ...(statsData || {}) }));
      const nextId = statsData?.nextAvailableTileId ?? data.stats?.nextAvailableTileId;
      if (nextId != null) setNextAvailableTileId(nextId);
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
    playSound('tile-click');
    setSelectedTile(tileId);
    // If unclaimed, open claim modal
    if (!tiles[tileId]) setClaimModalTile(tileId);
  }, [tiles]);

  const panelOpen = selectedTile !== null;

  return (
    <div className="app-shell">
      <OnboardingModal onComplete={() => setIntroReady(true)} />
      {claimModalTile !== null && (
        <ClaimModal
          tileId={claimModalTile}
          onClose={() => setClaimModalTile(null)}
          onClaimed={async (claimedTileId) => {
            setClaimModalTile(null);
            const data = await fetchGrid();
            if (data) {
              setTiles(data.tiles);
              setStats(prev => ({ ...prev, ...data.stats }));
            }
            // Fly to the claimed tile
            if (claimedTileId != null) {
              setSelectedTile(claimedTileId);
              setFlyToTileId({ id: claimedTileId, ts: Date.now() });
            }
          }}
        />
      )}
      {/* Block tiles feature removed */}
      {spanClaimTopLeft !== null && (
        <MultiTileSpanModal
          topLeftId={spanClaimTopLeft}
          tiles={tiles}
          onClose={() => setSpanClaimTopLeft(null)}
          onCreated={async () => {
            setSpanClaimTopLeft(null);
            const [data, sp] = await Promise.all([fetchGrid(), fetchSpans()]);
            if (data) {
              setTiles(data.tiles);
              setStats(prev => ({ ...prev, ...data.stats }));
              setSpans(data.spans || sp);
            }
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
        {/* Activity Feed — collapsible left panel (single persistent instance) */}
        <div className={`activity-panel${activityFeedOpen ? ' open' : ''}`}>
          <ActivityFeed
            onTileClick={(tileId) => {
              setSelectedTile(tileId);
              setFlyToTileId({ id: tileId, ts: Date.now() });
            }}
            collapsed={!activityFeedOpen}
            onToggleCollapse={() => setActivityFeedOpen(v => !v)}
          />
        </div>
        <Grid
          tiles={tiles}
          blocks={blocks}
          spans={spans}
          connections={connections}
          pendingRequests={
            // Only show badges on tiles the connected user owns
            address
              ? Object.fromEntries(
                  Object.entries(pendingRequests).filter(([tileId]) => {
                    const t = tiles[String(tileId)];
                    return t && t.owner && address.toLowerCase() === t.owner.toLowerCase();
                  })
                )
              : {}
          }
          onConnectionsChange={setConnections}
          onTileClick={handleTileClick}
          onBlockClaimRequest={null}
          onSpanClaimRequest={setSpanClaimTopLeft}
          flyToTileId={flyToTileId}
          actionAnimation={actionAnimation}
          introReady={introReady}
          onIntroFinished={onIntroFinished}
          initialCamera={isReturnNav ? window.__tiles_camera : null}
          selectedTile={selectedTile}
          zoom={zoom}
          onZoomChange={setZoom}
          viewMode={viewMode}
          searchQuery={searchQuery}
          categoryFilter={filterCategory}
          heatmapMode={heatmapMode}
          alliances={alliances}
          bountyTiles={bountyTiles}
          pixelWars={pixelWars}
          pixelWarsChampions={pixelWarsChampions}
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
            onNavigateToTile={(tileId) => {
              playSound('whoosh');
              setFlyToTileId({ id: tileId, ts: Date.now() });
              setSelectedTile(tileId);
            }}
            allTiles={tiles}
            alliances={alliances}
            onAlliancesChange={setAlliances}
            onAction={setActionAnimation}
            onClaim={(tileId) => { setSelectedTile(null); setClaimModalTile(tileId); }}
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
