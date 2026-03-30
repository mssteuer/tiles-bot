'use client';
import React from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { initSounds, isMuted, toggleMute, playSound } from '@/lib/sound';

function SoundToggle() {
  const [muted, setMuted] = React.useState(true);
  React.useEffect(() => {
    initSounds().then(() => setMuted(isMuted()));
  }, []);
  return (
    <button
      onClick={() => { const m = toggleMute(); setMuted(m); if (!m) playSound('tile-click'); }}
      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 15, cursor: 'pointer', padding: '2px 4px' }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
    >{muted ? '🔇' : '🔊'}</button>
  );
}

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
          color: '#94a3b8', padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          {address?.slice(0, 6)}…{address?.slice(-4)} ▾
        </button>
        {showPicker && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000,
            background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 8,
            padding: 6, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 10, color: '#cbd5e1', padding: '4px 8px', marginBottom: 2 }}>
              Connected: {activeConnector?.name || 'Unknown'}
            </div>
            <button onClick={() => { disconnect(); setShowPicker(false); }} style={{
              width: '100%', textAlign: 'left', padding: '8px', background: 'none',
              border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', borderRadius: 4,
            }}>Disconnect</button>
          </div>
        )}
      </div>
    );
  }

  const seen = new Set();
  const uniqueConnectors = connectors.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
  const ICONS = { 'MetaMask': '🦊', 'Coinbase Wallet': '🔵', 'Injected': '🔌' };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setShowPicker(!showPicker)} style={{
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8,
        color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>Connect Wallet</button>
      {showPicker && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1000,
          background: '#0d0d1a', border: '1px solid #2a2a3e', borderRadius: 8,
          padding: 6, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {uniqueConnectors.map(c => (
            <button key={c.uid} onClick={() => { connect({ connector: c }); setShowPicker(false); }} style={{
              width: '100%', textAlign: 'left', padding: '10px', background: 'none',
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
  const pct = stats.total > 0 ? ((stats.claimed / stats.total) * 100) : 0;
  const price = parseFloat(stats.currentPrice ?? 0).toFixed(4);
  const totalRevenue = stats.totalRevenue ?? 0;
  const estimatedMax = stats.estimatedSoldOutRevenue ?? 0;
  const revenuePct = estimatedMax > 0 ? Math.min((totalRevenue / estimatedMax) * 100, 100) : 0;

  const fmtRevenue = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(2)}`;
  };

  return (
    <header style={{ background: '#0d0d1a', borderBottom: '1px solid #1a1a2e', padding: 0, flexShrink: 0 }}>

      {/* ── Row 1: Brand + Nav + Actions ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', gap: 12, minHeight: 44,
      }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>🤖</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>tiles.bot</div>
            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.2 }}>The Million Bot Homepage</div>
          </div>
        </div>

        {/* Nav links — desktop only */}
        <nav className="header-nav-desktop" style={{
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap',
        }}>
          {[
            { href: '/leaderboard', icon: '🏆', label: 'Top' },
            { href: '/agents', icon: '🤖', label: 'Agents' },
            { href: '/activity', icon: '📡', label: 'Activity' },
            { href: '/network', icon: '🕸️', label: 'Network' },
            { href: '/admin/analytics', icon: '📊', label: 'Stats' },
          ].map(({ href, icon, label }) => (
            <Link key={href} href={href} style={{
              color: '#94a3b8', textDecoration: 'none', fontSize: 11, padding: '4px 6px',
              borderRadius: 6, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
            }}>{icon} {label}</Link>
          ))}
          <a href="/SKILL.md" target="_blank" rel="noreferrer" style={{
            color: '#64748b', textDecoration: 'none', fontSize: 11, padding: '4px 6px',
            whiteSpace: 'nowrap',
          }}>📄</a>
          <Link href="/faq" style={{
            color: '#64748b', textDecoration: 'none', fontSize: 11, padding: '4px 6px',
          }}>❓</Link>
          <SoundToggle />
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button className="claim-btn" onClick={() => onClaimClick(nextAvailableTileId ?? 0)} style={{
            background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', borderRadius: 8,
            color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            Claim a Tile
          </button>
          <WalletButton />
        </div>
      </div>

      {/* ── Row 2: Stats bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '0 16px 6px', gap: 16, fontSize: 11, color: '#94a3b8',
        overflow: 'hidden',
      }}>
        {/* Claimed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#64748b' }}>Claimed</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{stats.claimed.toLocaleString()}</span>
          <span style={{ color: '#475569' }}>/</span>
          <span style={{ color: '#64748b' }}>{stats.total.toLocaleString()}</span>
          <div style={{ width: 60, height: 3, background: '#1e1e30', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`, height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 2,
            }} />
          </div>
          <span style={{ color: '#475569', fontSize: 10 }}>{pct.toFixed(2)}%</span>
        </div>

        <span style={{ color: '#1e1e30' }}>│</span>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#64748b' }}>Price</span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>${price}</span>
        </div>

        <span style={{ color: '#1e1e30' }}>│</span>

        {/* Revenue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#64748b' }}>Revenue</span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{fmtRevenue(totalRevenue)}</span>
          <span style={{ color: '#475569', fontSize: 10 }}>of {fmtRevenue(estimatedMax)}</span>
          <div style={{ width: 40, height: 3, background: '#1e1e30', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(revenuePct, revenuePct > 0 ? 2 : 0)}%`, height: '100%',
              background: 'linear-gradient(90deg, #16a34a, #22c55e)', borderRadius: 2,
            }} />
          </div>
        </div>
      </div>
    </header>
  );
}
