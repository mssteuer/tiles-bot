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

  return (
    <div className="w-full max-w-full min-w-0 shrink bg-surface-alt text-[13px] text-text-dim rounded-xl border border-[#2a2a3e] overflow-hidden self-stretch box-border">
      <div className={`flex cursor-pointer items-center justify-between px-3.5 py-2.5 bg-surface-2 ${open ? 'border-b border-[#2a2a3e]' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="text-[13px] font-bold text-text">📊 Grid Stats</span>
        <span className="text-[16px] text-indigo-500">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="flex flex-col gap-3.5 px-3.5 py-3">
          {stats ? (
            <div className="flex flex-col gap-1.5">
              <div>
                <span className="font-bold text-accent-blue">{stats.claimed.toLocaleString()}</span>
                <span className="text-text-light"> / {stats.total.toLocaleString()} tiles claimed</span>
                <span className="text-text-light"> ({claimedPct}%)</span>
              </div>
              <div>
                Current price: <span className="font-bold text-accent-purple">{formatUsd(stats.currentPrice)} USDC</span>
              </div>
              <div>
                Est. sold out: <span className="font-bold text-amber-500">{formatUsd(stats.estimatedSoldOutRevenue)}</span>
              </div>
              <div className="mt-1">
                <div className="mb-1">
                  Revenue collected: <span className="font-bold text-accent-green">{formatUsdShort(totalRevenue)}</span>
                  <span className="text-[11px] text-text-gray"> / {formatUsdShort(estimatedMax)} max</span>
                </div>
                <div className="retro-progress-track h-1.5 w-full !rounded bg-surface-2">
                  <div className="retro-progress-fill !rounded bg-linear-to-r from-green-600 via-accent-green to-green-300 transition-[width] duration-500 ease-in-out" style={{ '--progress-width': `${Math.max(revenuePct, revenuePct > 0 ? 1 : 0)}%` }} />
                </div>
                <div className="mt-0.5 text-[10px] text-text-gray">{revenuePct.toFixed(3)}% of max revenue</div>
              </div>
              <div>
                Next tile: <span className="font-bold text-accent-green">#{stats.nextAvailableTileId}</span>
              </div>
            </div>
          ) : (
            <div className="text-text-dim">Loading…</div>
          )}

          {stats?.topHolders?.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-indigo-500">Top Holders</div>
              <div className="flex flex-col gap-1">
                {stats.topHolders.map((h, i) => (
                  <div key={h.owner} className="flex justify-between">
                    <span className="text-text-dim"><span className="mr-1 text-text-dim">{i + 1}.</span>{truncateAddr(h.owner)}</span>
                    <span className="font-semibold text-text">{h.count} tiles</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.recentlyClaimed?.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-indigo-500">Recently Claimed</div>
              <div className="flex flex-col gap-1">
                {stats.recentlyClaimed.map(t => (
                  <div key={t.id} className="flex justify-between gap-2">
                    <span className="truncate whitespace-nowrap text-text-dim"><span className="mr-1 text-text-dim">#{t.id}</span>{t.name}</span>
                    <span className="shrink-0 text-text-light">{timeAgo(t.claimedAt, nowTs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-right text-[11px] text-text-gray">Live updates via SSE</div>
        </div>
      )}
    </div>
  );
}
