'use client';

import { useState, useMemo } from 'react';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;

export default function BatchClaimModal({ tileIds, tiles, onClose }) {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Separate claimed vs unclaimed
  const { unclaimed, alreadyClaimed } = useMemo(() => {
    const unclaimed = [];
    const alreadyClaimed = [];
    for (const id of tileIds) {
      if (tiles[id]) alreadyClaimed.push(id);
      else unclaimed.push(id);
    }
    return { unclaimed, alreadyClaimed };
  }, [tileIds, tiles]);

  // Estimate total price (bonding curve: $1 at current supply, roughly)
  // Use server-side calculation — for UI show estimate
  const estimatedPrice = useMemo(() => {
    // We don't have live bonding curve in client, so show per-tile price as $1+
    // Real price computed on server
    return unclaimed.length; // placeholder: $1 per tile (actual price from bonding curve)
  }, [unclaimed]);

  const handleClaim = async () => {
    if (unclaimed.length === 0) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/tiles/batch-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileIds: unclaimed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch claim failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  const preview = tileIds.slice(0, 10);
  const rest = tileIds.length - 10;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0f0f1a',
        border: '1px solid #1a1a2e',
        borderRadius: 16,
        padding: 28,
        width: 440,
        maxWidth: '95vw',
        maxHeight: '80vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Batch Claim Tiles</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ margin: '0 0 8px', color: '#22c55e' }}>Batch claim submitted!</h3>
            <p style={{ color: '#888', fontSize: 14 }}>Your tiles are being processed. Check back in a moment.</p>
            <button onClick={onClose} style={{
              marginTop: 16,
              background: '#22c55e',
              border: 'none',
              color: '#000',
              padding: '10px 24px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}>Close</button>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <StatBox label="Selected" value={tileIds.length} color="#3b82f6" />
              <StatBox label="Available" value={unclaimed.length} color="#22c55e" />
              <StatBox label="Already Claimed" value={alreadyClaimed.length} color="#ef4444" />
            </div>

            {/* Price estimate */}
            {unclaimed.length > 0 && (
              <div style={{
                background: '#1a1a2e',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ color: '#888', fontSize: 14 }}>Estimated total (USDC)</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
                  ~${estimatedPrice.toFixed(2)}
                </span>
              </div>
            )}

            {/* Tile list preview */}
            <div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                Selected Tiles
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preview.map(id => {
                  const isClaimed = !!tiles[id];
                  return (
                    <span key={id} style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      background: isClaimed ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                      border: `1px solid ${isClaimed ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
                      color: isClaimed ? '#ef4444' : '#3b82f6',
                    }}>
                      #{id}{isClaimed ? ' ✗' : ''}
                    </span>
                  );
                })}
                {rest > 0 && (
                  <span style={{ padding: '3px 8px', color: '#555', fontSize: 12 }}>
                    and {rest} more...
                  </span>
                )}
              </div>
              {alreadyClaimed.length > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>
                  ⚠️ {alreadyClaimed.length} tile{alreadyClaimed.length > 1 ? 's are' : ' is'} already claimed and will be excluded.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#ef4444',
              }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid #333',
                color: '#888',
                padding: '12px 0',
                borderRadius: 10,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}>
                Cancel
              </button>
              <button
                onClick={handleClaim}
                disabled={unclaimed.length === 0 || claiming}
                style={{
                  flex: 2,
                  background: unclaimed.length === 0 ? '#222' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  color: unclaimed.length === 0 ? '#555' : '#fff',
                  padding: '12px 0',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: unclaimed.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  transition: 'opacity 0.2s',
                  opacity: claiming ? 0.7 : 1,
                }}
              >
                {claiming ? 'Claiming...' : unclaimed.length === 0 ? 'No tiles to claim' : `Claim ${unclaimed.length} tile${unclaimed.length > 1 ? 's' : ''}`}
              </button>
            </div>

            {unclaimed.length > 0 && (
              <p style={{ margin: 0, fontSize: 11, color: '#444', textAlign: 'center', lineHeight: 1.6 }}>
                Pay with USDC on Base via x402. Actual price calculated on-chain.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      background: '#1a1a2e',
      borderRadius: 10,
      padding: '14px 12px',
      textAlign: 'center',
      border: `1px solid ${color}22`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{label}</div>
    </div>
  );
}
