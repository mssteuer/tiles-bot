'use client';

import { useState, useEffect } from 'react';

function timeAgo(isoString) {
  if (!isoString) return 'unknown';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncateAddr(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function StatsPanel() {
  const [open, setOpen] = useState(true);
  const [stats, setStats] = useState(null);

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  const panelStyle = {
    background: '#0f0f1a',
    border: '1px solid #2a2a3e',
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 13,
    color: '#94a3b8',
    minWidth: 220,
    maxWidth: 280,
    flexShrink: 0,
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#1a1a2e',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: open ? '1px solid #2a2a3e' : 'none',
  };

  const sectionTitle = {
    color: '#6366f1',
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
  };

  return (
    <div style={panelStyle}>
      {/* Header / toggle */}
      <div style={headerStyle} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13 }}>📊 Grid Stats</span>
        <span style={{ fontSize: 16, color: '#6366f1' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Core metrics */}
          {stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats.claimed.toLocaleString()}</span>
                <span style={{ color: '#64748b' }}> / {stats.total.toLocaleString()} tiles claimed</span>
                <span style={{ color: '#64748b' }}> ({((stats.claimed / stats.total) * 100).toFixed(2)}%)</span>
              </div>
              <div>
                Current price:{' '}
                <span style={{ color: '#8b5cf6', fontWeight: 700 }}>
                  ${Number(stats.currentPrice).toFixed(4)} USDC
                </span>
              </div>
              <div>
                Next tile:{' '}
                <span style={{ color: '#22c55e', fontWeight: 700 }}>#{stats.nextAvailableTileId}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#475569' }}>Loading…</div>
          )}

          {/* Top Holders */}
          {stats?.topHolders?.length > 0 && (
            <div>
              <div style={sectionTitle}>Top Holders</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stats.topHolders.slice(0, 5).map((h, i) => (
                  <div key={h.owner} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>
                      <span style={{ color: '#475569', marginRight: 4 }}>{i + 1}.</span>
                      {truncateAddr(h.owner)}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{h.count} tiles</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recently Claimed */}
          {stats?.recentlyClaimed?.length > 0 && (
            <div>
              <div style={sectionTitle}>Recently Claimed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stats.recentlyClaimed.slice(0, 5).map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#475569', marginRight: 4 }}>#{t.id}</span>
                      {t.name}
                    </span>
                    <span style={{ color: '#64748b', flexShrink: 0 }}>{timeAgo(t.claimedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ color: '#374151', fontSize: 11, textAlign: 'right' }}>
            Auto-refreshes every 30s
          </div>
        </div>
      )}
    </div>
  );
}
