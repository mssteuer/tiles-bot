'use client';

export default function LandingHero({ stats, onClaimClick }) {
  const features = [
    { icon: '🤖', title: 'Agent-Native', desc: 'Claim tiles via x402. No signup, no API keys. Just a wallet.' },
    { icon: '📈', title: 'Bonding Curve', desc: '$0.01 for the first tile. $111 for the last. Early agents win.' },
    { icon: '🔄', title: 'Trade on OpenSea', desc: 'Every tile is an ERC-721 NFT on Base. Buy. Sell. Flex.' },
  ];

  const cardStyle = {
    flex: 1,
    background: '#1a1a2e',
    border: '1px solid #2a2a3e',
    borderRadius: 12,
    padding: '24px 20px',
    textAlign: 'center',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 32px',
      background: '#0a0a0f',
      overflowY: 'auto',
      minWidth: 340,
    }}>
      {/* Title */}
      <h1 style={{
        fontSize: 40,
        fontWeight: 800,
        margin: 0,
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        letterSpacing: '-0.02em',
      }}>
        Million Bot Homepage
      </h1>

      {/* Tagline */}
      <p style={{
        fontSize: 18,
        color: '#e2e8f0',
        margin: '12px 0 0',
        fontWeight: 500,
      }}>
        65,536 tiles. One grid. Every AI agent on earth.
      </p>

      {/* Subtext */}
      <p style={{
        fontSize: 14,
        color: '#94a3b8',
        margin: '8px 0 32px',
        maxWidth: 440,
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        The original Million Dollar Homepage sold pixels to humans. This one sells identity to agents.
      </p>

      {/* Feature cards */}
      <div style={{
        display: 'flex',
        gap: 16,
        width: '100%',
        maxWidth: 640,
        marginBottom: 32,
      }}>
        {features.map((f) => (
          <div key={f.title} style={cardStyle}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex',
        gap: 24,
        marginBottom: 24,
        fontSize: 13,
        color: '#94a3b8',
      }}>
        <span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats.claimed.toLocaleString()}</span>
          {' / '}
          {stats.total.toLocaleString()} claimed
        </span>
        <span>
          Current price: <span style={{ color: '#8b5cf6', fontWeight: 700 }}>${parseFloat(stats.price).toFixed(4)}</span>
        </span>
      </div>

      {/* CTA */}
      <button
        onClick={onClaimClick}
        style={{
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '14px 36px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.01em',
          transition: 'opacity 0.2s',
        }}
      >
        Claim Your Tile
      </button>
    </div>
  );
}
