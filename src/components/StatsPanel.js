'use client';

import React from 'react';
import { formatChainPrice } from '@/lib/header-wallet-formatting';

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

function hasRenderableNumber(value) {
  return value != null && !Number.isNaN(Number(value));
}

function renderRevenue(value, chain) {
  if (!hasRenderableNumber(value)) return null;
  return formatChainPrice(value, chain);
}

export default function StatsPanel({ stats }) {
  const [open, setOpen] = React.useState(true);
  const claimedPct = stats?.total > 0 ? ((stats.claimed / stats.total) * 100).toFixed(2) : '0.00';
  const [nowTs, setNowTs] = React.useState(Date.now());
  const perChain = stats?.perChain || {};
  const hasMixedChainRevenue = Boolean(perChain.base && perChain.casper);

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
                Current Base price: <span className="font-bold text-accent-purple">{formatChainPrice(stats.currentPrice, 'base')} USDC</span>
              </div>
              {(perChain.base || perChain.casper) && (
                <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                  {perChain.base && (
                    <div>
                      <span className="text-blue-400">Base:</span>{' '}
                      <span className="font-semibold">{formatChainPrice(perChain.base.currentPrice, 'base')} USDC</span>
                      <span className="text-text-gray"> ({perChain.base.claimed} claimed)</span>
                      {renderRevenue(perChain.base.totalRevenue, 'base') && (
                        <span className="text-text-gray"> · revenue {renderRevenue(perChain.base.totalRevenue, 'base')} USDC</span>
                      )}
                    </div>
                  )}
                  {perChain.casper && (
                    <div>
                      <span className="text-red-400">Casper:</span>{' '}
                      <span className="font-semibold">
                        {hasRenderableNumber(perChain.casper.currentPrice) ? formatChainPrice(perChain.casper.currentPrice, 'casper') : 'price unavailable'}
                      </span>
                      <span className="text-text-gray"> ({perChain.casper.claimed} claimed)</span>
                      {renderRevenue(perChain.casper.totalRevenue, 'casper') && (
                        <span className="text-text-gray"> · revenue {renderRevenue(perChain.casper.totalRevenue, 'casper')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!hasMixedChainRevenue && (
                <div>
                  Est. sold out: <span className="font-bold text-amber-500">{formatChainPrice(stats.estimatedSoldOutRevenue, 'base')}</span>
                </div>
              )}
              {hasMixedChainRevenue && (
                <div className="text-[11px] text-text-gray">
                  Revenue shown per chain to avoid mixing USDC and CSPR totals.
                </div>
              )}
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
