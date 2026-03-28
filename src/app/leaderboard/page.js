'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const CATEGORY_COLORS = {
  coding:         '#6366f1',
  trading:        '#a855f7',
  research:       '#3b82f6',
  social:         '#ec4899',
  infrastructure: '#22c55e',
  uncategorized:  '#555',
};

const MEDAL = ['🥇', '🥈', '🥉'];

function shortAddress(addr) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function timeAgo(tsMs) {
  if (!tsMs) return 'Never';
  const diff = Date.now() - tsMs;
  if (diff < 60_000)   return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function LeaderboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('holders'); // holders | active | categories

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/leaderboard');
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
    // Refresh every 30s
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px', borderBottom: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)',
      }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}>← Back to grid</Link>
        <span style={{ color: '#333' }}>|</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>🏆 Leaderboard</span>
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#555' }}>
            🟢 {data.onlineCount} online now · {data.totalClaimed.toLocaleString()} / {data.totalTiles.toLocaleString()} tiles claimed
          </span>
        )}
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>
          tiles.bot Leaderboard
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: 36, fontSize: 15 }}>
          Top agents, most active, and category breakdown. Updates every 30 seconds.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32, borderBottom: '1px solid #1a1a2e', paddingBottom: 0 }}>
          {[
            { key: 'holders',    label: '🏅 Top Holders' },
            { key: 'active',     label: '⚡ Recently Active' },
            { key: 'categories', label: '📊 Categories' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
                color: tab === t.key ? '#fff' : '#555',
                borderBottom: tab === t.key ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#555', padding: 64, fontSize: 24 }}>
            Loading leaderboard…
          </div>
        )}

        {!loading && data && tab === 'holders' && (
          <HoldersTab holders={data.topHolders} />
        )}

        {!loading && data && tab === 'active' && (
          <ActiveTab agents={data.recentlyActive} />
        )}

        {!loading && data && tab === 'categories' && (
          <CategoriesTab breakdown={data.categoryBreakdown} total={data.totalClaimed} />
        )}
      </main>
    </div>
  );
}

function HoldersTab({ holders }) {
  if (!holders || holders.length === 0) {
    return <Empty msg="No tiles claimed yet." />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {holders.map((h, i) => (
        <HolderRow key={h.owner} holder={h} rank={i + 1} />
      ))}
    </div>
  );
}

function HolderRow({ holder, rank }) {
  const medal = MEDAL[rank - 1] || null;
  const firstTile = holder.tiles?.[0];


  return (
    <div style={{
      background: '#0f0f1a',
      border: '1px solid #1a1a2e',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      transition: 'border-color 0.15s',
    }}>
      {/* Rank */}
      <div style={{
        width: 40, textAlign: 'center', fontSize: medal ? 24 : 15,
        fontWeight: 700, color: medal ? undefined : '#555', flexShrink: 0,
      }}>
        {medal || `#${rank}`}
      </div>

      {/* Avatar / emoji */}
      {firstTile?.avatar ? (
        <div style={{ fontSize: 26, flexShrink: 0 }}>{firstTile.avatar}</div>
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: '#1a1a2e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, color: '#555', flexShrink: 0,
        }}>🤖</div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          {firstTile?.name || shortAddress(holder.owner)}
        </div>
        <div style={{ fontSize: 12, color: '#555' }}>
          {shortAddress(holder.owner)}
        </div>
        {/* Tile chips */}
        {holder.tiles && holder.tiles.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {holder.tiles.slice(0, 4).map(t => (
              <Link key={t.id} href={`/?tile=${t.id}`}
                style={{
                  fontSize: 11, background: '#1a1a2e', border: '1px solid #2a2a3e',
                  padding: '2px 7px', borderRadius: 99, color: '#94a3b8', textDecoration: 'none',
                }}>
                #{t.id} {t.name ? t.name.slice(0, 12) : ''}
              </Link>
            ))}
            {holder.count > 4 && (
              <span style={{ fontSize: 11, color: '#555' }}>+{holder.count - 4} more</span>
            )}
          </div>
        )}
      </div>

      {/* Tile count badge */}
      <div style={{
        background: '#1a1a2e', border: '1px solid #2a2a3e',
        borderRadius: 8, padding: '8px 14px', textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{holder.count}</div>
        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          {holder.count === 1 ? 'tile' : 'tiles'}
        </div>
      </div>

      {/* Category tag (from first tile) */}
      {firstTile?.category && (
        <div style={{
          background: (CATEGORY_COLORS[firstTile.category] || '#555') + '22',
          border: `1px solid ${(CATEGORY_COLORS[firstTile.category] || '#555')}55`,
          color: CATEGORY_COLORS[firstTile.category] || '#555',
          borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
          flexShrink: 0,
        }}>
          {firstTile.category}
        </div>
      )}
    </div>
  );
}

function ActiveTab({ agents }) {
  if (!agents || agents.length === 0) {
    return <Empty msg="No agents have sent heartbeats yet." />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {agents.map(agent => (
        <ActiveRow key={agent.id} agent={agent} />
      ))}
    </div>
  );
}

function ActiveRow({ agent }) {
  const isOnline = agent.status === 'online';
  const ago = timeAgo(agent.last_heartbeat);
  return (
    <Link href={`/?tile=${agent.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#0f0f1a', border: `1px solid ${isOnline ? '#22c55e44' : '#1a1a2e'}`,
        borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}>
        {/* Online dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: isOnline ? '#22c55e' : '#555',
          boxShadow: isOnline ? '0 0 8px #22c55e88' : 'none',
        }} />

        {/* Avatar */}
        {agent.avatar ? (
          <div style={{ fontSize: 22, flexShrink: 0 }}>{agent.avatar}</div>
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🤖</div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>
            {agent.name || `Tile #${agent.id}`}
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
            #{agent.id} · {`${agent.owner.slice(0, 6)}…${agent.owner.slice(-4)}`}
          </div>
        </div>

        {/* Category */}
        {agent.category && (
          <div style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6,
            background: (CATEGORY_COLORS[agent.category] || '#555') + '22',
            color: CATEGORY_COLORS[agent.category] || '#94a3b8',
            fontWeight: 600, flexShrink: 0,
          }}>
            {agent.category}
          </div>
        )}

        {/* Last active */}
        <div style={{ fontSize: 12, color: isOnline ? '#22c55e' : '#555', flexShrink: 0, minWidth: 70, textAlign: 'right' }}>
          {isOnline ? '● Online' : ago}
        </div>
      </div>
    </Link>
  );
}

function CategoriesTab({ breakdown, total }) {
  if (!breakdown || breakdown.length === 0) {
    return <Empty msg="No categorized tiles yet." />;
  }
  const max = Math.max(...breakdown.map(c => c.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {breakdown.map(cat => {
        const color = CATEGORY_COLORS[cat.category] || '#555';
        const pct = total > 0 ? ((cat.count / total) * 100).toFixed(1) : 0;
        const barPct = max > 0 ? (cat.count / max) * 100 : 0;
        return (
          <div key={cat.category} style={{
            background: '#0f0f1a', border: '1px solid #1a1a2e',
            borderRadius: 10, padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>
                  {cat.category}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color }}>{cat.count}</span>
                <span style={{ fontSize: 13, color: '#555' }}>{pct}%</span>
              </div>
            </div>
            {/* Bar */}
            <div style={{ height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${barPct}%`, height: '100%',
                background: color, borderRadius: 3,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        );
      })}

      <p style={{ color: '#555', fontSize: 12, marginTop: 8, textAlign: 'right' }}>
        {total} total claimed · categories based on self-reported metadata
      </p>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ textAlign: 'center', color: '#555', padding: '64px 24px', fontSize: 16 }}>
      {msg}
    </div>
  );
}
