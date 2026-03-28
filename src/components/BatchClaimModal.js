'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { parseAbi } from 'viem';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const GRID_SIZE = 256;

const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const CONTRACT_ABI = parseAbi([
  'function batchClaim(uint256[] calldata tileIds) external',
  'function currentPrice() view returns (uint256)',
]);

function detectRectangle(tileIds) {
  if (!tileIds || tileIds.length < 2) return null;
  const sorted = [...tileIds].sort((a, b) => a - b);
  const rows = sorted.map((id) => Math.floor(id / GRID_SIZE));
  const cols = sorted.map((id) => id % GRID_SIZE);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  if (width * height !== sorted.length) return null;

  const expected = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      expected.push(row * GRID_SIZE + col);
    }
  }
  if (expected.some((id, index) => id !== sorted[index])) return null;
  return {
    topLeftId: minRow * GRID_SIZE + minCol,
    width,
    height,
    tileIds: expected,
  };
}

export default function BatchClaimModal({ tileIds, tiles, onClose, onClaimed, onSpanClaimRequest }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const [step, setStep] = useState('preview');
  const [error, setError] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [claimedCount, setClaimedCount] = useState(0);
  const frozenTiles = useRef(null);
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { unclaimed, alreadyClaimed } = useMemo(() => {
    if (frozenTiles.current) return frozenTiles.current;
    const unclaimed = [];
    const alreadyClaimed = [];
    for (const id of tileIds) {
      const t = tiles[id];
      if (t && t.owner) alreadyClaimed.push(id);
      else unclaimed.push(id);
    }
    return { unclaimed, alreadyClaimed };
  }, [tileIds, tiles]);

  const claimedRectangle = useMemo(() => detectRectangle(unclaimed), [unclaimed]);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => setCurrentPrice(d.currentPrice || 0.01))
      .catch(() => setCurrentPrice(0.01));
  }, []);

  const estimatedTotal = currentPrice !== null ? (currentPrice * unclaimed.length).toFixed(4) : '...';
  const perTilePrice = currentPrice !== null ? currentPrice.toFixed(4) : '...';

  const handleBatchClaim = async () => {
    if (!isConnected || unclaimed.length === 0) return;

    try {
      frozenTiles.current = { unclaimed: [...unclaimed], alreadyClaimed: [...alreadyClaimed] };
      setClaimedCount(unclaimed.length);
      setStep('approve');
      setError(null);

      const approveAmount = BigInt(Math.ceil((currentPrice || 1) * unclaimed.length * 1.5 * 1e6));
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, approveAmount],
      });

      setStep('claim');

      const claimTx = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'batchClaim',
        args: [unclaimed.map(id => BigInt(id))],
      });

      // Wait for tx confirmation, then batch-register all tiles in one call
      // (avoids per-tile ownerOf RPC lag that causes 404s)
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: claimTx });
      }

      try {
        await fetch('/api/tiles/batch-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, tileIds: unclaimed, txHash: claimTx }),
        });
      } catch {}

      setStep('success');
      if (onClaimed) onClaimed(unclaimed);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied')) {
        frozenTiles.current = null;
        setStep('preview');
        return;
      }
      setError(msg);
      setStep('error');
    }
  };

  const gridCols = Math.min(unclaimed.length, 8);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }} onClick={e => e.stopPropagation()} /* no backdrop dismiss — use × or Cancel */>
      <div style={{
        background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 16,
        padding: 24, maxWidth: 520, width: '95%', maxHeight: '80vh', overflowY: 'auto',
        color: '#e2e8f0',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Batch Claim — {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        {alreadyClaimed.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
            ⚠️ {alreadyClaimed.length} tile{alreadyClaimed.length !== 1 ? 's' : ''} already claimed — skipping
          </div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 4,
          marginBottom: 16, maxHeight: 200, overflowY: 'auto',
        }}>
          {unclaimed.slice(0, 64).map(id => (
            <div key={id} style={{
              background: '#2a2a4a', borderRadius: 4, padding: 4,
              fontSize: 10, textAlign: 'center', color: '#94a3b8',
              border: '1px solid rgba(59,130,246,0.3)',
            }}>
              #{id}
            </div>
          ))}
          {unclaimed.length > 64 && (
            <div style={{ fontSize: 11, color: '#64748b', padding: 4 }}>+{unclaimed.length - 64} more</div>
          )}
        </div>

        <div style={{ background: '#0f0f23', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>
            <span>Price per tile:</span>
            <span>${perTilePrice} USDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>
            <span>Estimated total:</span>
            <span>~${estimatedTotal} USDC</span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            Actual cost may be slightly higher due to bonding curve increase per tile
          </div>
        </div>

        {step === 'success' && claimedRectangle && onSpanClaimRequest && (
          <div style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.35)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>These claimed tiles form a rectangle.</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              {claimedRectangle.width}×{claimedRectangle.height} starting at tile #{claimedRectangle.topLeftId}
            </div>
            <button onClick={() => { onSpanClaimRequest(claimedRectangle.topLeftId, claimedRectangle.tileIds); onClose(); }} style={{
              padding: '10px 14px', borderRadius: 8, background: '#0ea5e9', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              🧩 Upload Spanning Image
            </button>
          </div>
        )}

        {step === 'preview' && (
          !isConnected ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Connect your wallet first (🦊 button in header)
            </div>
          ) : (
            <button onClick={handleBatchClaim} style={{
              width: '100%', padding: '14px 0', borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}>
              Claim {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''} (~${estimatedTotal} USDC)
            </button>
          )
        )}

        {step === 'approve' && (
          <div className="btn-loading" style={{ textAlign: 'center', color: '#f59e0b', fontSize: 14, padding: '14px 0', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <span className="spinner" style={{ borderTopColor: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }} />
            Approving USDC — confirm in wallet…
          </div>
        )}

        {step === 'claim' && (
          <div className="btn-loading" style={{ textAlign: 'center', color: '#3b82f6', fontSize: 14, padding: '14px 0', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
            <span className="spinner" style={{ borderTopColor: '#3b82f6', borderColor: 'rgba(59,130,246,0.3)' }} />
            Claiming {frozenUnclaimed?.length || 0} tiles — confirm in wallet…
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 600 }}>
              {claimedCount} tiles claimed!
            </div>
            <button onClick={onClose} style={{
              marginTop: 12, padding: '10px 24px', borderRadius: 8,
              background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 8 }}>{error}</div>
            <button onClick={() => setStep('preview')} style={{
              padding: '10px 24px', borderRadius: 8,
              background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
