'use client';

import { useState, useMemo } from 'react';

const GRID_SIZE = 256;
const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

/**
 * BlockClaimModal — lets user claim a 2x2 or 3x3 block of tiles.
 * Opens when user right-clicks (or long-presses) an empty tile and selects "Claim as Block".
 *
 * Props:
 *   topLeftId   — tile ID of the proposed top-left corner
 *   tiles       — current tiles map { [id]: tile }
 *   onClose     — close handler
 *   onClaimed   — called with { block } after successful claim
 */
export default function BlockClaimModal({ topLeftId, tiles, onClose, onClaimed }) {
  const [blockSize, setBlockSize] = useState(2);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const col = topLeftId % GRID_SIZE;
  const row = Math.floor(topLeftId / GRID_SIZE);

  // Compute the tile IDs for the selected block size
  const tileIds = useMemo(() => {
    if (col + blockSize > GRID_SIZE || row + blockSize > GRID_SIZE) return null;
    const ids = [];
    for (let r = 0; r < blockSize; r++) {
      for (let c = 0; c < blockSize; c++) {
        ids.push((row + r) * GRID_SIZE + (col + c));
      }
    }
    return ids;
  }, [topLeftId, blockSize, col, row]);

  const { available, blocked } = useMemo(() => {
    if (!tileIds) return { available: [], blocked: [] };
    const available = [], blocked = [];
    for (const id of tileIds) {
      if (tiles[id]) blocked.push(id);
      else available.push(id);
    }
    return { available, blocked };
  }, [tileIds, tiles]);

  const isOutOfBounds = !tileIds;
  const hasConflicts = blocked.length > 0;
  const canClaim = !isOutOfBounds && !hasConflicts && tileIds && tileIds.length > 0;

  // Estimated price: blockSize² × current bonding curve price
  // We don't have live price on client, just show "n tiles at current price"
  const tileCount = tileIds ? tileIds.length : 0;

  const handleClaim = async () => {
    if (!canClaim) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topLeftId, blockSize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Block claim failed');
      setSuccess(data);
      if (onClaimed) onClaimed(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0f0f1a',
        border: '1px solid #1a1a2e',
        borderRadius: 16,
        padding: 28,
        width: 420,
        maxWidth: '95vw',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Claim Block Tile</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#555' }}>
              Premium multi-tile claim — one name, one avatar, bigger presence
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ margin: '0 0 8px', color: '#22c55e' }}>Block claimed!</h3>
            <p style={{ color: '#888', fontSize: 14 }}>
              Your {blockSize}×{blockSize} block (tile #{topLeftId}) is now yours.
              Update its name and avatar in the tile panel.
            </p>
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
            {/* Block size selector */}
            <div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Block Size</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[2, 3].map(size => {
                  const outOfBounds = col + size > GRID_SIZE || row + size > GRID_SIZE;
                  return (
                    <button
                      key={size}
                      onClick={() => !outOfBounds && setBlockSize(size)}
                      disabled={outOfBounds}
                      style={{
                        flex: 1,
                        padding: '14px 0',
                        borderRadius: 10,
                        border: blockSize === size ? '2px solid #8b5cf6' : '1px solid #333',
                        background: blockSize === size ? 'rgba(139,92,246,0.15)' : '#1a1a2e',
                        color: outOfBounds ? '#444' : blockSize === size ? '#c4b5fd' : '#888',
                        cursor: outOfBounds ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: 15,
                        transition: 'all 0.15s',
                      }}
                    >
                      {size}×{size}
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                        {size * size} tiles
                        {outOfBounds ? ' (out of bounds)' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual preview grid */}
            <div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Preview — starting at tile #{topLeftId} (row {row}, col {col})
              </div>
              <div style={{
                display: 'inline-grid',
                gridTemplateColumns: `repeat(${blockSize}, 52px)`,
                gridTemplateRows: `repeat(${blockSize}, 52px)`,
                gap: 2,
                border: '2px solid #8b5cf6',
                borderRadius: 8,
                padding: 4,
                background: 'rgba(139,92,246,0.08)',
              }}>
                {(tileIds || []).map((id, i) => {
                  const isClaimed = !!tiles[id];
                  const tileRow = Math.floor(i / blockSize);
                  const tileCol = i % blockSize;
                  const isTopLeft = i === 0;
                  return (
                    <div
                      key={id}
                      title={`Tile #${id}${isClaimed ? ' — CLAIMED' : ''}`}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 4,
                        background: isClaimed ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.2)',
                        border: isClaimed ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(139,92,246,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: isClaimed ? '#ef4444' : '#c4b5fd',
                        gap: 2,
                      }}
                    >
                      {isTopLeft && <span style={{ fontSize: 16 }}>🤖</span>}
                      <span style={{ fontSize: 9 }}>#{id}</span>
                      {isClaimed && <span style={{ fontSize: 9 }}>✗</span>}
                    </div>
                  );
                })}
              </div>
              {isOutOfBounds && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444' }}>
                  ⚠️ Block extends outside grid boundaries. Choose a different size or top-left tile.
                </p>
              )}
              {!isOutOfBounds && hasConflicts && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#ef4444' }}>
                  ⚠️ {blocked.length} tile{blocked.length > 1 ? 's are' : ' is'} already claimed. Move to a free area.
                </p>
              )}
              {!isOutOfBounds && !hasConflicts && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#22c55e' }}>
                  ✓ All {tileCount} tiles available
                </p>
              )}
            </div>

            {/* Price info */}
            <div style={{
              background: '#1a1a2e',
              borderRadius: 10,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#888' }}>Cost</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{tileCount} tiles × current bonding curve price</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#8b5cf6' }}>
                {tileCount} tiles via x402
              </div>
            </div>

            {/* Benefits callout */}
            <div style={{
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', marginBottom: 6 }}>✨ Block advantages</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#888', lineHeight: 1.8 }}>
                <li>Displayed as one large merged tile on the grid</li>
                <li>Bigger avatar image — {blockSize * 32}×{blockSize * 32}px display</li>
                <li>Single name, description, and metadata for all {tileCount} tiles</li>
                <li>More visible at lower zoom levels</li>
              </ul>
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
                disabled={!canClaim || claiming}
                style={{
                  flex: 2,
                  background: !canClaim ? '#222' : 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
                  border: 'none',
                  color: !canClaim ? '#555' : '#fff',
                  padding: '12px 0',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: !canClaim ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  opacity: claiming ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {claiming ? 'Claiming…' : !canClaim ? 'Cannot claim' : `Claim ${blockSize}×${blockSize} Block`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
