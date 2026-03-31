'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { playSound } from '@/lib/sound';
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

const MAX_BATCH_TILES = 256; // 16×16 max span

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

  const { unclaimed, alreadyClaimed, wasCapped } = useMemo(() => {
    if (frozenTiles.current) return frozenTiles.current;
    const unclaimed = [];
    const alreadyClaimed = [];
    for (const id of tileIds) {
      const t = tiles[id];
      if (t && t.owner) alreadyClaimed.push(id);
      else unclaimed.push(id);
    }
    const wasCapped = unclaimed.length > MAX_BATCH_TILES;
    return { unclaimed: unclaimed.slice(0, MAX_BATCH_TILES), alreadyClaimed, wasCapped };
  }, [tileIds, tiles]);

  const claimedRectangle = useMemo(() => detectRectangle(unclaimed), [unclaimed]);

  const [totalMinted, setTotalMinted] = useState(0);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        setCurrentPrice(d.currentPrice || 0.01);
        setTotalMinted(d.claimed || 0);
      })
      .catch(() => setCurrentPrice(0.01));
  }, []);

  // Progressive bonding curve: sum price for each sequential mint
  const { estimatedTotal, perTilePrice } = useMemo(() => {
    if (currentPrice === null) return { estimatedTotal: '...', perTilePrice: '...' };
    let total = 0;
    const TOTAL_TILES = 65536;
    for (let i = 0; i < unclaimed.length; i++) {
      total += Math.exp(Math.log(11111) * (totalMinted + i) / TOTAL_TILES) / 100;
    }
    return {
      estimatedTotal: total.toFixed(4),
      perTilePrice: currentPrice.toFixed(4),
    };
  }, [currentPrice, totalMinted, unclaimed.length]);

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
      playSound('batch-claim');
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
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()} /* no backdrop dismiss — use × or Cancel */>
      <div className="retro-modal w-[95%] max-w-[520px]" onClick={e => e.stopPropagation()}>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[20px]">Batch Claim — {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''}</h2>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent px-1 text-[24px] text-text-dim">×</button>
        </div>

        {alreadyClaimed.length > 0 && (
          <div className="mb-3 rounded-[2px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-2.5 text-[13px]">
            ⚠️ {alreadyClaimed.length} tile{alreadyClaimed.length !== 1 ? 's' : ''} already claimed — skipping
          </div>
        )}

        <div className="mb-4 grid max-h-[200px] gap-1 overflow-y-auto" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
          {unclaimed.slice(0, 64).map(id => (
            <div key={id} className="rounded-[2px] border border-blue-500/30 bg-surface-2 p-1 text-center text-[10px] text-text-dim">
              #{id}
            </div>
          ))}
          {unclaimed.length > 64 && (
            <div className="p-1 text-[11px] text-text-light">+{unclaimed.length - 64} more</div>
          )}
        </div>

        {wasCapped && (
          <div className="mb-3 rounded-[2px] border border-red-500/30 bg-red-500/10 px-2.5 py-2.5 text-[13px] text-red-400">
            ⚠️ Selection capped to {MAX_BATCH_TILES} tiles (max {Math.sqrt(MAX_BATCH_TILES)}×{Math.sqrt(MAX_BATCH_TILES)} span). Select fewer tiles.
          </div>
        )}

        <div className="mb-4 rounded-[2px] border border-border bg-surface px-3 py-3">
          <div className="mb-1.5 flex justify-between text-[13px] text-text-dim">
            <span>Starting price:</span>
            <span className="font-mono">${perTilePrice} USDC</span>
          </div>
          <div className="flex justify-between text-[16px] font-semibold text-text">
            <span>Total ({unclaimed.length} tiles):</span>
            <span className="font-mono">${estimatedTotal} USDC</span>
          </div>
          <div className="mt-1 text-[11px] text-text-light">
            Price increases per tile along the bonding curve
          </div>
        </div>

        {step === 'success' && claimedRectangle && onSpanClaimRequest && (
          <div className="mb-4 rounded-[2px] border border-sky-500/35 bg-sky-500/12 px-3 py-3">
            <div className="mb-1 text-[14px] font-semibold">These claimed tiles form a rectangle.</div>
            <div className="mb-2.5 text-[12px] text-text-dim">
              {claimedRectangle.width}×{claimedRectangle.height} starting at tile #{claimedRectangle.topLeftId}
            </div>
            <button onClick={() => { onSpanClaimRequest(claimedRectangle.topLeftId, claimedRectangle.tileIds); onClose(); }}
              className="btn-retro btn-retro-primary"
              className="btn-retro btn-retro-primary px-3.5 py-2.5">
              🧩 Upload Spanning Image
            </button>
          </div>
        )}

        {step === 'preview' && (
          !isConnected ? (
            <div className="text-center text-[14px] text-text-dim">
              Connect your wallet first (🦊 button in header)
            </div>
          ) : (
            <button onClick={handleBatchClaim}
              className="btn-retro btn-retro-primary"
              className="btn-retro btn-retro-primary w-full px-0 py-3.5 text-[16px]">
              Claim {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''} (${estimatedTotal} USDC)
            </button>
          )
        )}

        {step === 'approve' && (
          <div className="btn-loading rounded-[2px] border border-amber-500/30 bg-amber-500/10 px-0 py-3.5 text-center text-[14px] text-amber-500">
            <span className="spinner border-amber-500/30" style={{ borderTopColor: '#f59e0b' }} />
            Approving USDC — confirm in wallet…
          </div>
        )}

        {step === 'claim' && (
          <div className="btn-loading rounded-[2px] border border-blue-500/30 bg-blue-500/10 px-0 py-3.5 text-center text-[14px] text-accent-blue">
            <span className="spinner border-blue-500/30" style={{ borderTopColor: '#3b82f6' }} />
            Claiming {unclaimed.length} tiles — confirm in wallet…
          </div>
        )}

        {step === 'success' && (
          <div className="text-center">
            <div className="mb-2 text-[40px]">🎉</div>
            <div className="text-[16px] font-semibold text-accent-green">{claimedCount} tiles claimed!</div>
            <button onClick={onClose}
              className="btn-retro btn-retro-green"
              className="btn-retro btn-retro-green mt-3 px-6 py-2.5">
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center">
            <div className="mb-2 text-[14px] text-accent-red">{error}</div>
            <button onClick={() => setStep('preview')}
              className="btn-retro btn-retro-primary"
              className="btn-retro btn-retro-primary px-6 py-2.5">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
