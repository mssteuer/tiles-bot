import { getTilesByOwner } from '@/lib/db';
import Link from 'next/link';

function categoryPillStyle(color) {
  return {
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color,
  };
}

export async function generateMetadata({ params }) {
  const { address } = await params;
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return {
    title: `${short} — tiles.bot`,
    description: `All tiles owned by ${short} on tiles.bot`,
  };
}

export default async function OwnerPage({ params }) {
  const { address } = await params;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-dark text-white">
        <div className="text-center">
          <h1 className="text-accent-red">Invalid Address</h1>
          <Link href="/" className="text-accent-blue">← Back to grid</Link>
        </div>
      </div>
    );
  }

  const tiles = getTilesByOwner(address);
  const totalTiles = tiles.length;
  const namedTiles = tiles.filter(t => t.name && !t.name.startsWith('Tile #')).length;
  const onlineTiles = tiles.filter(t => t.status === 'online').length;
  const withImages = tiles.filter(t => t.imageUrl).length;
  const categories = {};
  tiles.forEach(t => {
    const cat = t.category || 'uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const namedPercent = totalTiles > 0 ? Math.round((namedTiles / totalTiles) * 100) : 0;

  const catColors = {
    trading: '#f59e0b', research: '#8b5cf6', coding: '#3b82f6',
    creative: '#ec4899', gaming: '#10b981', social: '#06b6d4',
    infrastructure: '#64748b', security: '#ef4444', data: '#14b8a6',
    finance: '#f59e0b', health: '#22c55e', education: '#a78bfa',
    entertainment: '#fb923c', productivity: '#6366f1', other: '#94a3b8',
    uncategorized: '#374151',
  };

  return (
    <div className="min-h-screen bg-surface-dark font-body text-white">
      <header className="flex items-center gap-4 border-b border-border-dim bg-linear-to-b from-surface-alt to-surface-dark px-6 py-4">
        <Link href="/" className="text-[14px] text-text-dim no-underline">← Back to grid</Link>
        <span className="text-text-dim">|</span>
        <span className="text-[18px] font-bold">🤖 Owner Dashboard</span>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-[24px] font-extrabold tracking-[-0.02em]">{short}</h1>
          <p className="break-all font-mono text-[13px] text-text-light">{address}</p>
        </div>

        <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
          {[
            { label: 'Total Tiles', value: totalTiles, color: 'text-accent-blue' },
            { label: 'Named', value: `${namedTiles} (${namedPercent}%)`, color: 'text-accent-green' },
            { label: 'With Images', value: withImages, color: 'text-accent-purple' },
            { label: 'Online Now', value: onlineTiles, color: 'text-emerald-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border-dim bg-surface-alt p-5">
              <div className={`text-[24px] font-extrabold ${color}`}>{value}</div>
              <div className="mt-1 text-[12px] text-text-light">{label}</div>
            </div>
          ))}
        </div>

        {Object.keys(categories).length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-[16px] font-bold text-text-dim">CATEGORIES</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                const color = catColors[cat] || '#94a3b8';
                return (
                  <span key={cat} className="rounded-[20px] px-3 py-1 text-[12px] font-semibold" style={categoryPillStyle(color)}>
                    {cat} · {count}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {totalTiles === 0 ? (
          <div className="py-12 text-center text-text-light">
            <div className="mb-4 text-[48px]">🤖</div>
            <p>No tiles found for this address.</p>
            <Link href="/" className="text-accent-blue">Claim a tile →</Link>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-[16px] font-bold text-text-dim">ALL TILES ({totalTiles})</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {tiles.map(tile => {
                const pillColor = catColors[tile.category] || '#94a3b8';
                return (
                  <Link key={tile.id} href={`/tiles/${tile.id}`} className="no-underline">
                    <div className={`cursor-pointer rounded-xl border p-4 transition-colors ${tile.status === 'online' ? 'border-accent-green/30' : 'border-border-dim'} bg-surface-alt`}>
                      <div className="mb-2 flex items-center gap-2.5">
                        {tile.imageUrl ? (
                          <img src={tile.imageUrl} alt={tile.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[20px]">{tile.avatar || '🤖'}</div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate whitespace-nowrap text-[13px] font-bold text-text">{tile.name || `Tile #${tile.id}`}</div>
                          <div className="text-[11px] text-text-dim">#{tile.id}</div>
                        </div>
                      </div>
                      {tile.description && (
                        <p className="mb-2 overflow-hidden text-[11px] leading-[1.4] text-text-light [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{tile.description}</p>
                      )}
                      <div className="flex items-center gap-1.5">
                        {tile.category && tile.category !== 'uncategorized' && (
                          <span className="rounded-[10px] px-2 py-0.5 text-[10px]" style={categoryPillStyle(pillColor)}>{tile.category}</span>
                        )}
                        {tile.status === 'online' && <span className="text-[10px] text-accent-green">● online</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-12 rounded-xl border border-border-dim bg-surface-alt p-6">
          <p className="mb-2 text-[14px] font-semibold">Bulk update your tiles via API</p>
          <p className="mb-4 text-[13px] text-text-light">Own many tiles? Update metadata for up to 50 tiles in a single request.</p>
          <code className="block whitespace-pre-wrap rounded-lg border border-border-dim bg-[#060608] p-3 font-mono text-[12px] text-text-dim">{`PATCH /api/owner/${short}/bulk-update\n{ "updates": [\n  { "id": 123, "name": "My Agent", "category": "coding" }\n] }`}</code>
        </div>
      </main>
    </div>
  );
}
