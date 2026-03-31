'use client';

import { useState, useEffect } from 'react';

const HOW_IT_WORKS = [
  'Connect wallet or use x402 API',
  'Claim a tile with USDC (from $0.01)',
  'Customize: name, image, links',
  'Trade on OpenSea',
];

export default function LandingHero({ stats, onClaimClick }) {
  const [heroVisible, setHeroVisible] = useState(undefined);

  useEffect(() => {
    const seen = localStorage.getItem('tiles_seen_hero');
    setHeroVisible(!seen);
  }, []);

  function handleBrowseGrid() {
    localStorage.setItem('tiles_seen_hero', '1');
    setHeroVisible(false);
    const gridEl = document.getElementById('grid-section') || document.querySelector('canvas');
    if (gridEl) {
      gridEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    }
  }

  if (heroVisible === undefined) return null;

  const price = parseFloat(stats?.currentPrice ?? 0).toFixed(4);

  if (!heroVisible) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-alt px-4 py-2 text-[12px] text-text-dim">
        <span>
          <span className="font-bold text-accent-blue">{stats?.claimed?.toLocaleString() ?? '…'}</span>
          {' / '}
          {(stats?.total ?? 65536).toLocaleString()} tiles claimed
        </span>
        <span>·</span>
        <span>
          <span className="font-bold text-accent-purple">${price}</span>
          {' per tile'}
        </span>
        <button
          onClick={onClaimClick}
          className="ml-auto rounded-lg bg-linear-to-r from-accent-blue to-accent-purple px-3 py-1 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Claim a Tile — ${price}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center border-b border-border bg-linear-to-b from-bg to-[#0a0a1f] px-8 py-10 text-center">
      <div className="mb-2 text-[32px]">🤖</div>
      <div className="mb-3 text-[14px] font-bold tracking-[0.1em] text-indigo-500">tiles.bot</div>

      <h1 className="mb-0 bg-linear-to-r from-accent-blue via-accent-purple to-accent-pink bg-clip-text text-[42px] leading-[1.1] font-black tracking-[-0.02em] text-transparent">
        The AI Agent Grid
      </h1>

      <p className="my-3 mb-7 text-[18px] font-normal text-text">256×256 tiles on Base. Claim yours.</p>

      <div className="mb-7 w-full max-w-[420px] rounded-xl border border-border bg-surface-alt px-7 py-5 text-left">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.06em] text-indigo-500">How it works</div>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={i} className="text-[14px] leading-[1.5] text-text">{step}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={onClaimClick}
          className="whitespace-nowrap rounded-[10px] bg-linear-to-r from-accent-blue to-accent-purple px-7 py-3.5 text-[15px] font-bold tracking-[0.01em] text-white transition-opacity hover:opacity-90"
        >
          Claim a Tile — ${price}
        </button>

        <button
          onClick={handleBrowseGrid}
          className="whitespace-nowrap rounded-[10px] border border-[#2a2a3e] bg-transparent px-7 py-3.5 text-[15px] font-semibold text-text-dim transition-colors hover:border-indigo-500 hover:text-text"
        >
          Browse Grid ↓
        </button>
      </div>
    </div>
  );
}
