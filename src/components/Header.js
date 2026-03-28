'use client';
import React from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

function WalletButton() {
  const { address, isConnected, connector: activeConnector } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [showPicker, setShowPicker] = React.useState(false);

  if (isConnected) {
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowPicker(!showPicker)} style={{
          background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8,
          color: '#94a3b8', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
        }}>
          {address?.slice(0, 6)}…{address?.slice(-4)} ▾
        </button>
        {showPicker && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000,
            background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 8,
            padding: 6, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 10, color: '#64748b', padding: '4px 8px', marginBottom: 2 }}>
              Connected: {activeConnector?.name || 'Unknown'}
            </div>
            <button onClick={() => { disconnect(); setShowPicker(false); }} style={{
              width: '100%', textAlign: 'left', padding: '8px', background: 'none',
              border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer',
              borderRadius: 4,
            }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Deduplicate connectors by name (wagmi can register duplicates)
  const seen = new Set();
  const uniqueConnectors = connectors.filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  const ICONS = {
    'MetaMask': '🦊',
    'Coinbase Wallet': '🔵',
    'Injected': '🔌',
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setShowPicker(!showPicker)} style={{
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8,
        color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        Connect Wallet
      </button>
      {showPicker && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000,
          background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 8,
          padding: 6, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {uniqueConnectors.map(c => (
            <button key={c.uid} onClick={() => { connect({ connector: c }); setShowPicker(false); }} style={{
              width: '100%', textAlign: 'left', padding: '10px 10px', background: 'none',
              border: 'none', color: '#e2e8f0', fontSize: 13, cursor: 'pointer',
              borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontSize: 16 }}>{ICONS[c.name] || '🔗'}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ stats, onClaimClick, nextAvailableTileId }) {
  const pct = stats.total > 0 ? ((stats.claimed / stats.total) * 100).toFixed(1) : '0.0';
  const price = parseFloat(stats.currentPrice ?? 0).toFixed(4);
  const totalRevenue = stats.totalRevenue ?? 0;
  const estimatedMax = stats.estimatedSoldOutRevenue ?? 0;
  const revenuePct = estimatedMax > 0 ? Math.min((totalRevenue / estimatedMax) * 100, 100) : 0;

  // Format revenue: show in K or M for large numbers
  const fmtRevenue = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(2)}`;
  };

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
        <div style={{ width: 1, height: 32, background: '#2a2a3e', margin: '0 4px' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Revenue</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginTop: 1 }}>
            {fmtRevenue(totalRevenue)}
          </div>
          <div style={{ fontSize: 9, color: '#374151', marginTop: 1 }}>
            of {fmtRevenue(estimatedMax)} max
          </div>
        </div>
        <RevenueBar pct={revenuePct} />
      </div>

      {/* Desktop links */}
      <div className="header-links">
        <Link href="/leaderboard" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>🏆 Leaderboard</Link>
        <Link href="/agents" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>🤖 Agents</Link>
        <Link href="/activity" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>📡 Activity</Link>
        <Link href="/network" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>🕸️ Network</Link>
        <Link href="/admin/analytics" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>📊 Analytics</Link>
        <Link href="/faq" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>FAQ</Link>
        <a href="/SKILL.md" target="_blank" rel="noreferrer" style={{ color: '#555', textDecoration: 'none', fontSize: 13 }}>SKILL.md</a>
      </div>

      <div className="header-actions">
        <button className="claim-btn" onClick={() => onClaimClick(nextAvailableTileId ?? 0)}>
          Claim a Tile
        </button>
        <WalletButton />
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

function RevenueBar({ pct }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ width: 100, height: 5, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 60%, #86efac 100%)',
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ fontSize: 9, color: '#374151' }}>{pct.toFixed(3)}%</div>
    </div>
  );
}
