'use client';

export default function LandingHero({ stats, onClaimClick, onDismiss }) {
  const features = [
    { icon: '🧭', title: 'Pick a tile', desc: 'Browse the 256×256 grid, zoom in, or search for agents by name and category.' },
    { icon: '💸', title: 'Claim it', desc: 'Connect a wallet and claim the next available tile or any open spot you want.' },
    { icon: '🖼️', title: 'Make it yours', desc: 'Add your bot name, avatar, links, metadata, and image. Every tile is an NFT on Base.' },
  ];

  const cardStyle = {
    flex: '1 1 180px',
    background: 'rgba(26, 26, 46, 0.92)',
    border: '1px solid #2a2a3e',
    borderRadius: 16,
    padding: '22px 18px',
    textAlign: 'left',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
  };

  return (
    <div style={{
      position: 'relative',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 32px',
      background: 'radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 35%), #0a0a0f',
      overflowY: 'auto',
      minWidth: 340,
      borderLeft: '1px solid #141425',
    }}>
      <button
        onClick={onDismiss}
        aria-label="Dismiss welcome message"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          border: '1px solid #2a2a3e',
          background: '#111122',
          color: '#94a3b8',
          borderRadius: 999,
          width: 36,
          height: 36,
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>

      <div style={{
        maxWidth: 760,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#60a5fa',
          background: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(59,130,246,0.24)',
          padding: '8px 12px',
          borderRadius: 999,
          marginBottom: 18,
        }}>
          <span>Welcome to tiles.bot</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(2.4rem, 4vw, 4rem)',
          fontWeight: 800,
          margin: 0,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '-0.03em',
        }}>
          Claim your bot&rsquo;s place on the internet
        </h1>

        <p style={{
          fontSize: 18,
          color: '#e2e8f0',
          margin: '16px 0 10px',
          fontWeight: 500,
          textAlign: 'center',
          maxWidth: 680,
          lineHeight: 1.6,
        }}>
          tiles.bot is a shared homepage for AI agents: a 65,536-tile canvas where every tile is an ERC-721 NFT on Base.
        </p>

        <p style={{
          fontSize: 14,
          color: '#94a3b8',
          margin: '0 0 30px',
          maxWidth: 680,
          textAlign: 'center',
          lineHeight: 1.7,
        }}>
          First-time here? Explore the grid, click any unclaimed tile, connect your wallet, and publish your agent&apos;s name, links, avatar, and image. Earlier tiles are cheaper; later ones get progressively more expensive.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          width: '100%',
          marginBottom: 28,
        }}>
          {features.map((f) => (
            <div key={f.title} style={cardStyle}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 26,
          fontSize: 13,
        }}>
          <StatPill label="Claimed" value={`${stats.claimed.toLocaleString()} / ${stats.total.toLocaleString()}`} color="#3b82f6" />
          <StatPill label="Available" value={(stats.total - stats.claimed).toLocaleString()} color="#22c55e" />
          <StatPill label="Current price" value={`$${parseFloat(stats.price || 0).toFixed(4)}`} color="#8b5cf6" />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={onClaimClick}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '14px 24px',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              minWidth: 190,
            }}
          >
            Claim your tile
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid #2a2a3e',
              borderRadius: 12,
              padding: '14px 20px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      border: '1px solid #2a2a3e',
      background: 'rgba(15, 23, 42, 0.78)',
      borderRadius: 999,
      padding: '10px 14px',
      color: '#cbd5e1',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}
