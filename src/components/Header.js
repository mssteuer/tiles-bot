'use client';
import React from 'react';
import Link from 'next/link';
import { ConnectKitButton } from 'connectkit';
import { initSounds, isMuted, toggleMute, playSound } from '@/lib/sound';

function SoundToggle() {
  const [muted, setMuted] = React.useState(true);
  React.useEffect(() => {
    initSounds().then(() => setMuted(isMuted()));
  }, []);
  return (
    <button
      onClick={() => { const m = toggleMute(); setMuted(m); if (!m) playSound('tile-click'); }}
      style={{ background: 'none', border: 'none', color: '#b0bec5', fontSize: 15, cursor: 'pointer', padding: '2px 4px' }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
    >{muted ? '🔇' : '🔊'}</button>
  );
}

function WalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => (
        <button onClick={show} style={{
          background: isConnected ? '#1a1a2e' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          border: isConnected ? '1px solid #2a2a3e' : 'none',
          borderRadius: 8,
          color: isConnected ? '#cbd5e1' : '#fff',
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
          {isConnected ? (ensName ?? truncatedAddress) : 'Connect Wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
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
            <div style={{ fontSize: 10, color: '#b0bec5', lineHeight: 1.2 }}>The Million Bot Homepage</div>
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
            { href: '/faq', icon: '❓', label: 'FAQ' },
          ].map(({ href, icon, label }) => (
            <Link key={href} href={href} style={{
              color: '#cbd5e1', textDecoration: 'none', fontSize: 13, padding: '4px 8px',
              borderRadius: 6, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
            }}>{icon} {label}</Link>
          ))}
          <a href="/SKILL.md" target="_blank" rel="noreferrer" style={{
            color: '#cbd5e1', textDecoration: 'none', fontSize: 13, padding: '4px 8px',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3,
          }}>📄 SKILL.md</a>
          <SoundToggle />
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => onClaimClick(nextAvailableTileId ?? 0)} style={{
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
        padding: '0 16px 6px', gap: 16, fontSize: 11, color: '#cbd5e1',
        overflow: 'hidden',
      }}>
        {/* Claimed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#b0bec5' }}>Claimed</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{stats.claimed.toLocaleString()}</span>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ color: '#b0bec5' }}>{stats.total.toLocaleString()}</span>
          <div style={{ width: 60, height: 3, background: '#2a2a3e', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`, height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 2,
            }} />
          </div>
          <span style={{ color: '#cbd5e1', fontSize: 10 }}>{pct.toFixed(2)}%</span>
        </div>

        <span style={{ color: '#334155' }}>│</span>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#b0bec5' }}>Price</span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>${price}</span>
        </div>

        <span style={{ color: '#334155' }}>│</span>

        {/* Revenue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#b0bec5' }}>Revenue</span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{fmtRevenue(totalRevenue)}</span>
          <span style={{ color: '#cbd5e1', fontSize: 10 }}>of {fmtRevenue(estimatedMax)}</span>
          <div style={{ width: 40, height: 3, background: '#2a2a3e', borderRadius: 2, overflow: 'hidden' }}>
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
