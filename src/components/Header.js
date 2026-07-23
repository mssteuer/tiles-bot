'use client';

import React from 'react';
import Link from 'next/link';
import WalletMenu from './WalletMenu';
import { initSounds, isMuted, toggleMute, playSound } from '@/lib/sound';
import { formatChainPrice } from '@/lib/header-wallet-formatting';

function SoundToggle() {
  const [muted, setMuted] = React.useState(true);

  React.useEffect(() => {
    initSounds().then(() => setMuted(isMuted()));
  }, []);

  return (
    <button
      onClick={() => {
        const m = toggleMute();
        setMuted(m);
        if (!m) playSound('tile-click');
      }}
      className="cursor-pointer border-none bg-transparent px-1 py-0.5 text-[15px] text-text-dim"
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export default function Header({ stats, onClaimClick, nextAvailableTileId }) {
  const pct = stats.total > 0 ? ((stats.claimed / stats.total) * 100) : 0;
  const price = parseFloat(stats.currentPrice ?? 0).toFixed(4);
  const perChain = stats.perChain || {};

  return (
    <header className="shrink-0 border-b border-border-dim bg-[#0d0d1a]">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <img src="/logo-128.png" alt="tiles.bot" className="h-8 w-8 [image-rendering:pixelated]" />
          <div>
            <div className="font-pixel text-[16px] leading-[1.1] font-bold tracking-[1px] text-white">tiles.bot</div>
            <div className="text-[10px] leading-[1.2] text-text-muted">A universe of bots</div>
          </div>
        </div>

        <nav className="header-nav-desktop flex items-center gap-0.5 whitespace-nowrap">
          {[
            { href: '/leaderboard', icon: '🏆', label: 'Top' },
            { href: '/agents', icon: '🤖', label: 'Agents' },
            { href: '/activity', icon: '📡', label: 'Activity' },
            { href: '/network', icon: '🕸️', label: 'Network' },
            { href: '/admin/analytics', icon: '📊', label: 'Stats' },
            { href: '/faq', icon: '❓', label: 'FAQ' },
          ].map(({ href, icon, label }) => (
            <Link key={href} href={href} className="flex items-center gap-1 px-2 py-1 text-[13px] text-text-light no-underline">
              {icon} {label}
            </Link>
          ))}
          <a href="/SKILL.md" target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 text-[13px] text-text-light no-underline">
            📄 SKILL.md
          </a>
          <SoundToggle />
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onClaimClick(nextAvailableTileId ?? 0)} className="btn-retro btn-retro-green px-[14px] py-1.5 text-[12px]">
            ▶ Claim a Tile
          </button>
          <WalletMenu />
        </div>
      </div>

      <div className="flex items-center justify-start gap-4 overflow-hidden px-4 pb-1.5 text-[11px] font-mono text-text-light">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-text-dim">Claimed</span>
          <span className="font-semibold text-white">{stats.claimed.toLocaleString()}</span>
          <span className="text-text-light">/</span>
          <span className="text-text-dim">{stats.total.toLocaleString()}</span>
          <div className="retro-progress-track h-[3px] w-[60px]">
            <div
              className="retro-progress-fill bg-linear-to-r from-accent-blue to-accent-purple"
              style={{ '--progress-width': `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-text-light">{pct.toFixed(2)}%</span>
          {(perChain.base || perChain.casper) && (
            <span className="ml-1 flex items-center gap-2 text-[10px]">
              {perChain.base && <span className="text-blue-400" title="Base claimed">● Base {Number(perChain.base.claimed || 0).toLocaleString()}</span>}
              {perChain.casper && <span className="text-red-400" title="Casper claimed">● Casper {Number(perChain.casper.claimed || 0).toLocaleString()}</span>}
            </span>
          )}
        </div>

        <span className="text-text-muted">│</span>

        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-text-dim">Price</span>
          {(perChain.base || perChain.casper) ? (
            <span className="flex items-center gap-2">
              {perChain.base && <span className="font-bold text-blue-400" title="Base (USDC)">{formatChainPrice(perChain.base.currentPrice, 'base')}</span>}
              {perChain.base && perChain.casper && <span className="text-[9px] text-text-muted">/</span>}
              {perChain.casper && <span className="font-bold text-red-400" title="Casper (CSPR)">{formatChainPrice(perChain.casper.currentPrice, 'casper')}</span>}
            </span>
          ) : (
            <span className="font-bold text-accent-blue">${price}</span>
          )}
        </div>
      </div>
    </header>
  );
}
