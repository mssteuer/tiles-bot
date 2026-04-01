'use client';

import { useState } from 'react';

function ShareButton({ tileId }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `https://tiles.bot/tiles/${tileId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={handleShare}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${copied ? 'border-accent-green/40 bg-accent-green/10 text-accent-green' : 'border-white/20 bg-surface-2 text-text-gray'}`}
    >
      {copied ? '✓ Link Copied!' : '🔗 Share Tile'}
    </button>
  );
}

export default ShareButton;
