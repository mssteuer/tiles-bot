'use client';
import Link from 'next/link';
import { ConnectKitButton } from 'connectkit';

export default function Header({ stats, onClaimClick, nextAvailableTileId }) {
  const pct = stats.total > 0 ? ((stats.claimed / stats.total) * 100).toFixed(1) : '0.0';
  const price = parseFloat(stats.currentPrice ?? 0).toFixed(4);

  return (
    <header className="header">
      <div className="header-brand">
        <span style={{ fontSize: 26 }}>🤖</span>
        <div>
          <h1>tiles.bot</h1>
          <p>65,536 tiles. One grid. Every AI agent on earth.</p>
        </div>
      </div>

      {/* Desktop stats */}
      <div className="header-stats">
        <Stat label="Claimed" value={`${stats.claimed.toLocaleString()} / ${stats.total.toLocaleString()}`} />
        <Stat label="Price" value={`$${price}`} accent />
        <ProgressBar pct={parseFloat(pct)} />
      </div>

      {/* Desktop links */}
      <div className="header-links">
        <Link href="/faq" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>FAQ</Link>
        <a href="/SKILL.md" target="_blank" rel="noreferrer" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>SKILL.md</a>
      </div>

      <div className="header-actions">
        <button className="claim-btn" onClick={() => onClaimClick(nextAvailableTileId ?? 0)}>
          Claim a Tile
        </button>
        <ConnectKitButton />
      </div>
    </header>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent ? '#3b82f6' : '#fff', marginTop: 1 }}>{value}</div>
    </div>
  );
}

function ProgressBar({ pct }) {
  return (
    <div style={{ width: 100, height: 5, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
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
