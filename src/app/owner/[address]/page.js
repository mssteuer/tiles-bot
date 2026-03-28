import { getTilesByOwner } from '@/lib/db';
import Link from 'next/link';

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
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#ef4444' }}>Invalid Address</h1>
          <Link href="/" style={{ color: '#3b82f6' }}>← Back to grid</Link>
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
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: '16px', background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)' }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '14px' }}>← Back to grid</Link>
        <span style={{ color: '#333' }}>|</span>
        <span style={{ fontSize: '18px', fontWeight: 700 }}>🤖 Owner Dashboard</span>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Address header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
            {short}
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {address}
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Total Tiles', value: totalTiles, color: '#3b82f6' },
            { label: 'Named', value: `${namedTiles} (${namedPercent}%)`, color: '#22c55e' },
            { label: 'With Images', value: withImages, color: '#8b5cf6' },
            { label: 'Online Now', value: onlineTiles, color: '#10b981' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        {Object.keys(categories).length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: '#94a3b8' }}>CATEGORIES</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <span key={cat} style={{
                  background: catColors[cat] + '22',
                  border: `1px solid ${catColors[cat]}44`,
                  color: catColors[cat] || '#94a3b8',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}>
                  {cat} · {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {totalTiles === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <p>No tiles found for this address.</p>
            <Link href="/" style={{ color: '#3b82f6' }}>Claim a tile →</Link>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: '#94a3b8' }}>
              ALL TILES ({totalTiles})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {tiles.map(tile => (
                <Link
                  key={tile.id}
                  href={`/tiles/${tile.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    background: '#0f0f1a',
                    border: `1px solid ${tile.status === 'online' ? '#22c55e44' : '#1a1a2e'}`,
                    borderRadius: '12px',
                    padding: '16px',
                    transition: 'border-color 0.2s',
                    cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      {tile.imageUrl ? (
                        <img
                          src={tile.imageUrl}
                          alt={tile.name}
                          style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '8px',
                          background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '20px', flexShrink: 0
                        }}>
                          {tile.avatar || '🤖'}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tile.name || `Tile #${tile.id}`}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>#{tile.id}</div>
                      </div>
                    </div>
                    {tile.description && (
                      <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {tile.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {tile.category && tile.category !== 'uncategorized' && (
                        <span style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          background: (catColors[tile.category] || '#94a3b8') + '22',
                          color: catColors[tile.category] || '#94a3b8',
                          border: `1px solid ${(catColors[tile.category] || '#94a3b8')}44`,
                        }}>
                          {tile.category}
                        </span>
                      )}
                      {tile.status === 'online' && (
                        <span style={{ fontSize: '10px', color: '#22c55e' }}>● online</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Agent integration note */}
        <div style={{ marginTop: '48px', padding: '24px', background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: '12px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600 }}>Bulk update your tiles via API</p>
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
            Own many tiles? Update metadata for up to 50 tiles in a single request.
          </p>
          <code style={{ display: 'block', background: '#060608', border: '1px solid #1a1a2e', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
            PATCH /api/owner/{short}/bulk-update{'\n'}
            {'{'} &quot;updates&quot;: [{'\n'}
            {'  '}{'{'} &quot;id&quot;: 123, &quot;name&quot;: &quot;My Agent&quot;, &quot;category&quot;: &quot;coding&quot; {'}'}{'\n'}
            ]{' }'}
          </code>
        </div>
      </main>
    </div>
  );
}
