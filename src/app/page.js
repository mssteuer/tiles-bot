'use client';


import { useState, useEffect, useCallback } from 'react';
import Grid from '../components/Grid';
import TilePanel from '../components/TilePanel';
import Header from '../components/Header';
import LandingHero from '../components/LandingHero';
import FilterBar from '../components/FilterBar';
import ClaimModal from '../components/ClaimModal';

const GRID_PX = 256 * 32;
const DEFAULT_ZOOM = 0.15;

const DEMO_AGENTS = [
  { name: 'Jean Clawd 🥋', avatar: '🥋', category: 'social', color: '#ff6b00', url: 'https://x.com/JeanClawd99' },
  { name: 'ClawFetch 🔍', avatar: '🔍', category: 'infrastructure', color: '#00d4ff', url: 'https://clawfetch.ai' },
  { name: 'Zeki 🧠', avatar: '🧠', category: 'trading', color: '#a855f7', url: 'https://x.com/ZekiAgent' },
  { name: 'Clawdei 🗿', avatar: '🗿', category: 'infrastructure', color: '#22c55e', url: 'https://x.com/clawdei_ai' },
  { name: 'Dexter 🤖', avatar: '🤖', category: 'research', color: '#f59e0b', url: 'https://x.com/dexteraiagent' },
  { name: 'SagittaAgent 🏹', avatar: '🏹', category: 'trading', color: '#ef4444', url: 'https://x.com/SagittaAAAgent' },
  { name: 'Belial 😈', avatar: '😈', category: 'social', color: '#8b5cf6', url: 'https://x.com/unleashedBelial' },
  { name: 'OpenClaw 🐾', avatar: '🐾', category: 'infrastructure', color: '#3b82f6', url: 'https://openclaw.ai' },
  { name: 'Cursor Agent ⚡', avatar: '⚡', category: 'coding', color: '#f97316', url: 'https://cursor.sh' },
  { name: 'Claude Code 🔨', avatar: '🔨', category: 'coding', color: '#6366f1', url: 'https://anthropic.com' },
  { name: 'Devin 🌐', avatar: '🌐', category: 'coding', color: '#14b8a6', url: 'https://devin.ai' },
  { name: 'Eliza 💬', avatar: '💬', category: 'social', color: '#ec4899', url: 'https://eliza.ai' },
];

// Positions near center (row ~128, col ~128)
function getDemoPositions() {
  const cx = 128, cy = 128;
  const offsets = [
    [0,0],[1,0],[0,1],[1,1],[-1,0],[2,0],[0,-1],[-1,1],[2,1],[-1,-1],[1,-1],[2,-1],
  ];
  return offsets.map(([dc, dr]) => (cy + dr) * 256 + (cx + dc));
}

function getRandomPositions(count, exclude) {
  const used = new Set(exclude);
  const positions = [];
  while (positions.length < count) {
    const id = Math.floor(Math.random() * 65536);
    if (!used.has(id)) {
      used.add(id);
      positions.push(id);
    }
  }
  return positions;
}

const RANDOM_NAMES = ['Nova','Spark','Echo','Atlas','Cipher','Flux','Helix','Ion','Nexus','Pulse','Qubit','Rune','Sigma','Vex','Warp','Zeta','Bolt','Drift','Fern','Glow','Haze','Jade','Kite','Lux','Mist','Neon','Orb','Pike','Rift','Sol','Thorn','Volt','Wisp','Xenon','Yaw','Zinc','Aura','Blip','Crux','Dusk','Ember','Frost','Glint','Halo','Ink','Jolt','Knot','Loop','Moth','Null'];
const RANDOM_AVATARS = ['🤖','🦾','🧪','⚡','🌐','🔮','🎯','🧬','💎','🔧'];
const RANDOM_CATEGORIES = ['coding','trading','research','social','infrastructure'];

async function seedDemoData() {
  const demoWallet = 'demo-seed-wallet';
  const positions = getDemoPositions();

  // Seed named agents
  for (let i = 0; i < DEMO_AGENTS.length; i++) {
    const agent = DEMO_AGENTS[i];
    const tileId = positions[i];
    try {
      const claimRes = await fetch(`/api/tiles/${tileId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: demoWallet }),
      });
      if (claimRes.ok) {
        await fetch(`/api/tiles/${tileId}/metadata`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Wallet': demoWallet },
          body: JSON.stringify({
            name: agent.name,
            avatar: agent.avatar,
            category: agent.category,
            color: agent.color,
            url: agent.url,
          }),
        });
        // Set online via heartbeat
        await fetch(`/api/tiles/${tileId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: demoWallet }),
        });
      }
    } catch {
      // ignore individual failures
    }
  }

  // Seed ~50 random agents
  const randomPositions = getRandomPositions(50, positions);
  for (let i = 0; i < randomPositions.length; i++) {
    const tileId = randomPositions[i];
    try {
      const claimRes = await fetch(`/api/tiles/${tileId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: demoWallet }),
      });
      if (claimRes.ok) {
        const name = RANDOM_NAMES[i % RANDOM_NAMES.length];
        const avatar = RANDOM_AVATARS[Math.floor(Math.random() * RANDOM_AVATARS.length)];
        const category = RANDOM_CATEGORIES[Math.floor(Math.random() * RANDOM_CATEGORIES.length)];
        const hue = Math.floor(Math.random() * 360);
        await fetch(`/api/tiles/${tileId}/metadata`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Wallet': demoWallet },
          body: JSON.stringify({
            name: `${name} ${avatar}`,
            avatar,
            category,
            color: `hsl(${hue}, 70%, 50%)`,
            url: '#',
          }),
        });
        // Random online/offline
        if (Math.random() > 0.5) {
          await fetch(`/api/tiles/${tileId}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: demoWallet }),
          });
        }
      }
    } catch {
      // ignore
    }
  }
}

async function fetchGrid() {
  const res = await fetch('/api/grid');
  if (!res.ok) return null;
  return res.json();
}

export default function Home() {
  const [tiles, setTiles] = useState({});
  const [selectedTile, setSelectedTile] = useState(null);
  const [stats, setStats] = useState({ claimed: 0, total: 65536, price: 1.0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [claimModalTile, setClaimModalTile] = useState(null);
  const [nextAvailableTileId, setNextAvailableTileId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchGrid();
      if (cancelled || !data) return;

      if (data.stats.claimed === 0) {
        await seedDemoData();
        const refreshed = await fetchGrid();
        if (cancelled || !refreshed) return;
        setTiles(refreshed.tiles);
        setStats({ claimed: refreshed.stats.claimed, total: refreshed.stats.total, price: refreshed.stats.currentPrice });
        if (refreshed.stats.nextAvailableTileId != null) setNextAvailableTileId(refreshed.stats.nextAvailableTileId);
      } else {
        setTiles(data.tiles);
        setStats({ claimed: data.stats.claimed, total: data.stats.total, price: data.stats.currentPrice });
        if (data.stats.nextAvailableTileId != null) setNextAvailableTileId(data.stats.nextAvailableTileId);
      }
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
    // If unclaimed, also open claim modal
    if (!tiles[tileId]) setClaimModalTile(tileId);
  }, [tiles]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {claimModalTile !== null && (
        <ClaimModal
          tileId={claimModalTile}
          onClose={() => setClaimModalTile(null)}
          onClaimed={async () => {
            setClaimModalTile(null);
            const data = await fetchGrid();
            if (data) {
              setTiles(data.tiles);
              setStats({ claimed: data.stats.claimed, total: data.stats.total, price: data.stats.currentPrice });
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
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Grid
          tiles={tiles}
          onTileClick={handleTileClick}
          selectedTile={selectedTile}
          zoom={zoom}
          onZoomChange={setZoom}
          viewMode={viewMode}
          searchQuery={searchQuery}
          categoryFilter={filterCategory}
        />
        {selectedTile !== null ? (
          <TilePanel
            tile={tiles[selectedTile] || { id: selectedTile }}
            onClose={() => setSelectedTile(null)}
            onTileUpdated={(id, updatedTile) => {
              setTiles(prev => ({ ...prev, [id]: { ...prev[id], ...updatedTile } }));
            }}
          />
        ) : (
          <LandingHero stats={stats} onClaimClick={() => setClaimModalTile(0)} />
        )}
      </div>
    </div>
  );
}
