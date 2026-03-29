'use client';

import React from 'react';

function timeAgo(isoString, nowTs) {
  if (!isoString) return 'unknown';
  const diff = nowTs - new Date(isoString).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
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

function formatUsd(value) {
  if (value == null || Number.isNaN(Number(value))) return '…';
  const n = Number(value);
  if (n >= 1000000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

function formatUsdShort(value) {
  if (value == null || Number.isNaN(Number(value))) return '…';
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

export default function StatsPanel({ stats }) {
  const [open, setOpen] = React.useState(true);
  const claimedPct = stats?.total > 0 ? ((stats.claimed / stats.total) * 100).toFixed(2) : '0.00';
  const [nowTs, setNowTs] = React.useState(Date.now());
  const totalRevenue = stats?.totalRevenue ?? 0;
  const estimatedMax = stats?.estimatedSoldOutRevenue ?? 0;
  const revenuePct = estimatedMax > 0 ? Math.min((totalRevenue / estimatedMax) * 100, 100) : 0;

  React.useEffect(() => {
    const tick = setInterval(() => setNowTs(Date.now()), 10_000);
    return () => clearInterval(tick);
  }, []);

  const panelStyle = {
    background: '#0f0f1a',
    border: '1px solid #2a2a3e',
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 13,
    color: '#94a3b8',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    alignSelf: 'stretch',
    boxSizing: 'border-box',
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
      <div style={headerStyle} onClick={() => setOpen(o => !o)}>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13 }}>📊 Grid Stats</span>
        <span style={{ fontSize: 16, color: '#6366f1' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats.claimed.toLocaleString()}</span>
                <span style={{ color: '#cbd5e1' }}> / {stats.total.toLocaleString()} tiles claimed</span>
                <span style={{ color: '#cbd5e1' }}> ({claimedPct}%)</span>
              </div>
              <div>
                Current price:{' '}
                <span style={{ color: '#8b5cf6', fontWeight: 700 }}>
                  {formatUsd(stats.currentPrice)} USDC
                </span>
              </div>
              <div>
                Est. sold out:{' '}
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                  {formatUsd(stats.estimatedSoldOutRevenue)}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <div style={{ marginBottom: 4 }}>
                  Revenue collected:{' '}
                  <span style={{ color: '#22c55e', fontWeight: 700 }}>
                    {formatUsdShort(totalRevenue)}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: 11 }}> / {formatUsdShort(estimatedMax)} max</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(revenuePct, revenuePct > 0 ? 1 : 0)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 60%, #86efac 100%)',
                    borderRadius: 3,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 2 }}>{revenuePct.toFixed(3)}% of max revenue</div>
              </div>
              <div>
                Next tile:{' '}
                <span style={{ color: '#22c55e', fontWeight: 700 }}>#{stats.nextAvailableTileId}</span>
              </div>
            </div>
          ) : (
            <div style={{ color: '#94a3b8' }}>Loading…</div>
          )}

          {stats?.topHolders?.length > 0 && (
            <div>
              <div style={sectionTitle}>Top Holders</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stats.topHolders.map((h, i) => (
                  <div key={h.owner} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>
                      <span style={{ color: '#94a3b8', marginRight: 4 }}>{i + 1}.</span>
                      {truncateAddr(h.owner)}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{h.count} tiles</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.recentlyClaimed?.length > 0 && (
            <div>
              <div style={sectionTitle}>Recently Claimed</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stats.recentlyClaimed.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#94a3b8', marginRight: 4 }}>#{t.id}</span>
                      {t.name}
                    </span>
                    <span style={{ color: '#cbd5e1', flexShrink: 0 }}>{timeAgo(t.claimedAt, nowTs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ color: '#9ca3af', fontSize: 11, textAlign: 'right' }}>
            Live updates via SSE
          </div>
        </div>
      )}
    </div>
  );
}
