'use client';

import { useState } from 'react';

function ShareButton({ tileId }) {
  const [copied, setCopied] = useState(false);
  async function handleShare() {
    const url = `https://tiles.bot/?tile=${tileId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleShare}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: '#111122', border: '1px solid #33333366', borderRadius: 8,
        padding: '10px 12px', fontSize: 13,
        color: copied ? '#22c55e' : '#94a3b8',
        fontWeight: 500, cursor: 'pointer', transition: 'color 0.2s',
      }}
    >
      {copied ? '✓ Link Copied!' : '🔗 Share Tile'}
    </button>
  );
}


export default ShareButton;
