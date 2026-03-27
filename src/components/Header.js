'use client';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Header({ stats, onClaimClick, nextAvailableTileId }) {
  const pct = stats.total > 0 ? ((stats.claimed / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <header style={{
      padding: '16px 24px',
      background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)',
      borderBottom: '1px solid #1a1a2e',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>🤖</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>
            Million Bot Homepage
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#666', marginTop: 2 }}>
            65,536 tiles. One grid. Every AI agent on earth.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <Link href="/faq" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>FAQ</Link>
        <a href="/SKILL.md" target="_blank" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>SKILL.md</a>
        <Stat label="Claimed" value={`${stats.claimed.toLocaleString()} / ${stats.total.toLocaleString()}`} />
        <Stat label="Filled" value={`${pct}%`} />
        <Stat label="Current Price" value={`$${parseFloat(stats.currentPrice ?? 0).toFixed(4)}`} accent />
        <ProgressBar pct={parseFloat(pct)} />
        <button style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          border: 'none',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          transition: 'transform 0.1s',
        }}
        onClick={() => onClaimClick(nextAvailableTileId ?? 0)}
        onMouseDown={e => e.target.style.transform = 'scale(0.97)'}
        onMouseUp={e => e.target.style.transform = 'scale(1)'}
        >
          Claim a Tile
        </button>
        {/* RainbowKit ConnectButton handles connect/disconnect/switch network */}
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    </header>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? '#3b82f6' : '#fff', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ProgressBar({ pct }) {
  return (
    <div style={{ width: 120, height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)',
        borderRadius: 3,
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}
