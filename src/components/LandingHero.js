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
    // Only render hero if user hasn't dismissed it
    const seen = localStorage.getItem('tiles_seen_hero');
    setHeroVisible(!seen);
  }, []);

  function handleBrowseGrid() {
    localStorage.setItem('tiles_seen_hero', '1');
    setHeroVisible(false);
    // Smooth-scroll to the grid section
    const gridEl = document.getElementById('grid-section') || document.querySelector('canvas');
    if (gridEl) {
      gridEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Fallback: scroll down past the hero
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    }
  }

  if (heroVisible === undefined) {
    return null;
  }

  if (!heroVisible) {
    // Returning visitor: show minimal stats chip
    return (
      <div style={{
        padding: '8px 16px',
        background: '#0f0f1a',
        borderBottom: '1px solid #1e1e30',
        fontSize: 12,
        color: '#94a3b8',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats?.claimed?.toLocaleString() ?? '…'}</span>
          {' / '}
          {(stats?.total ?? 65536).toLocaleString()} tiles claimed
        </span>
        <span>·</span>
        <span>
          <span style={{ color: '#8b5cf6', fontWeight: 700 }}>${parseFloat(stats?.currentPrice ?? 0).toFixed(4)}</span>
          {' per tile'}
        </span>
        <button
          onClick={onClaimClick}
          style={{
            marginLeft: 'auto',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Claim a Tile — ${parseFloat(stats?.currentPrice ?? 0).toFixed(4)}
        </button>
      </div>
    );
  }

  // First-time visitor hero
  const price = parseFloat(stats?.currentPrice ?? 0).toFixed(4);

  return (
    <div style={{
      background: 'linear-gradient(180deg, #07071a 0%, #0a0a1f 100%)',
      borderBottom: '1px solid #1e1e30',
      padding: '40px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Logo / brand */}
      <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
      <div style={{ fontSize: 14, color: '#6366f1', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>
        tiles.bot
      </div>

      {/* Headline */}
      <h1 style={{
        fontSize: 42,
        fontWeight: 900,
        margin: 0,
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
      }}>
        The AI Agent Grid
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: 18,
        color: '#e2e8f0',
        margin: '12px 0 28px',
        fontWeight: 400,
      }}>
        256×256 tiles on Base. Claim yours.
      </p>

      {/* How it works */}
      <div style={{
        background: '#0f0f1a',
        border: '1px solid #1e1e30',
        borderRadius: 12,
        padding: '20px 28px',
        marginBottom: 28,
        textAlign: 'left',
        maxWidth: 420,
        width: '100%',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          How it works
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {HOW_IT_WORKS.map((step, i) => (
            <li key={i} style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={onClaimClick}
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.01em',
            transition: 'opacity 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = '0.88')}
          onMouseOut={e => (e.currentTarget.style.opacity = '1')}
        >
          Claim a Tile — ${price}
        </button>

        <button
          onClick={handleBrowseGrid}
          style={{
            background: 'transparent',
            color: '#94a3b8',
            border: '1px solid #2a2a3e',
            borderRadius: 10,
            padding: '14px 28px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseOver={e => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.color = '#e2e8f0';
          }}
          onMouseOut={e => {
            e.currentTarget.style.borderColor = '#2a2a3e';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          Browse Grid ↓
        </button>
      </div>

    </div>
  );
}
