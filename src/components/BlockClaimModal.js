'use client';

import { useState, useMemo } from 'react';

const GRID_SIZE = 256;

export default function BlockClaimModal({ topLeftId, tiles, onClose, onClaimed }) {
  const [blockSize, setBlockSize] = useState(2);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const col = topLeftId % GRID_SIZE;
  const row = Math.floor(topLeftId / GRID_SIZE);

  const tileIds = useMemo(() => {
    if (col + blockSize > GRID_SIZE || row + blockSize > GRID_SIZE) return null;
    const ids = [];
    for (let r = 0; r < blockSize; r++) {
      for (let c = 0; c < blockSize; c++) ids.push((row + r) * GRID_SIZE + (col + c));
    }
    return ids;
  }, [topLeftId, blockSize, col, row]);

  const { blocked } = useMemo(() => {
    if (!tileIds) return { available: [], blocked: [] };
    const available = [];
    const blocked = [];
    for (const id of tileIds) {
      if (tiles[id]) blocked.push(id);
      else available.push(id);
    }
    return { available, blocked };
  }, [tileIds, tiles]);

  const isOutOfBounds = !tileIds;
  const hasConflicts = blocked.length > 0;
  const canClaim = !isOutOfBounds && !hasConflicts && tileIds && tileIds.length > 0;
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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-[4px]"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-[420px] max-w-[95vw] flex-col gap-5 rounded-2xl border border-border-dim bg-surface-alt p-7">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 text-[20px] font-bold">Claim Block Tile</h2>
            <p className="mt-1 text-[13px] text-text-gray">Premium multi-tile claim — one name, one avatar, bigger presence</p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent text-[24px] leading-none text-text-gray">×</button>
        </div>

        {success ? (
          <div className="px-2 py-6 text-center">
            <div className="mb-3 text-[48px]">🎉</div>
            <h3 className="mb-2 text-accent-green">Block claimed!</h3>
            <p className="text-[14px] text-text-light">
              Your {blockSize}×{blockSize} block (tile #{topLeftId}) is now yours.
              Update its name and avatar in the tile panel.
            </p>
            <button onClick={onClose} className="mt-4 cursor-pointer rounded-lg border-none bg-accent-green px-6 py-2.5 font-semibold text-black">Close</button>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-2.5 text-[12px] uppercase tracking-[1px] text-text-gray">Block Size</div>
              <div className="flex gap-2.5">
                {[2, 3].map(size => {
                  const outOfBounds = col + size > GRID_SIZE || row + size > GRID_SIZE;
                  return (
                    <button
                      key={size}
                      onClick={() => !outOfBounds && setBlockSize(size)}
                      disabled={outOfBounds}
                      className={`flex-1 rounded-[10px] px-0 py-3.5 text-[15px] font-bold transition-all ${blockSize === size ? 'border-2 border-accent-purple bg-accent-purple/15 text-purple-300' : 'border border-[#333] bg-surface-2 text-[#888]'} ${outOfBounds ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer'}`}
                    >
                      {size}×{size}
                      <span className="mt-0.5 block text-[11px] font-normal">
                        {size * size} tiles
                        {outOfBounds ? ' (out of bounds)' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2.5 text-[12px] uppercase tracking-[1px] text-text-gray">Preview — starting at tile #{topLeftId} (row {row}, col {col})</div>
              <div
                className="inline-grid gap-0.5 rounded-lg border-2 border-accent-purple bg-accent-purple/8 p-1"
                style={{ gridTemplateColumns: `repeat(${blockSize}, 52px)`, gridTemplateRows: `repeat(${blockSize}, 52px)` }}
              >
                {(tileIds || []).map((id, i) => {
                  const isClaimed = !!tiles[id];
                  const isTopLeft = i === 0;
                  return (
                    <div
                      key={id}
                      title={`Tile #${id}${isClaimed ? ' — CLAIMED' : ''}`}
                      className={`flex h-[52px] w-[52px] flex-col items-center justify-center gap-0.5 rounded text-[10px] ${isClaimed ? 'border border-red-500/50 bg-red-500/25 text-red-500' : 'border border-accent-purple/40 bg-accent-purple/20 text-purple-300'}`}
                    >
                      {isTopLeft && <span className="text-[16px]">🤖</span>}
                      <span className="text-[9px]">#{id}</span>
                      {isClaimed && <span className="text-[9px]">✗</span>}
                    </div>
                  );
                })}
              </div>
              {isOutOfBounds && <p className="mt-2 text-[12px] text-accent-red">⚠️ Block extends outside grid boundaries. Choose a different size or top-left tile.</p>}
              {!isOutOfBounds && hasConflicts && <p className="mt-2 text-[12px] text-accent-red">⚠️ {blocked.length} tile{blocked.length > 1 ? 's are' : ' is'} already claimed. Move to a free area.</p>}
              {!isOutOfBounds && !hasConflicts && <p className="mt-2 text-[12px] text-accent-green">✓ All {tileCount} tiles available</p>}
            </div>

            <div className="flex items-center justify-between rounded-[10px] bg-surface-2 px-4 py-3">
              <div>
                <div className="text-[13px] text-text-light">Cost</div>
                <div className="mt-0.5 text-[11px] text-text-gray">{tileCount} tiles × current bonding curve price</div>
              </div>
              <div className="text-[15px] font-bold text-accent-purple">{tileCount} tiles via x402</div>
            </div>

            <div className="rounded-[10px] border border-accent-purple/20 bg-accent-purple/8 px-4 py-3">
              <div className="mb-1.5 text-[12px] font-bold text-purple-300">✨ Block advantages</div>
              <ul className="m-0 list-disc pl-4 text-[12px] leading-[1.8] text-text-light">
                <li>Displayed as one large merged tile on the grid</li>
                <li>Bigger avatar image — {blockSize * 32}×{blockSize * 32}px display</li>
                <li>Single name, description, and metadata for all {tileCount} tiles</li>
                <li>More visible at lower zoom levels</li>
              </ul>
            </div>

            {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-accent-red">{error}</div>}

            <div className="flex gap-2.5">
              <button onClick={onClose} className="flex-1 cursor-pointer rounded-[10px] border border-[#333] bg-transparent px-0 py-3 text-[14px] font-semibold text-text-light">Cancel</button>
              <button
                onClick={handleClaim}
                disabled={!canClaim || claiming}
                className={`flex-[2] rounded-[10px] border-none px-0 py-3 text-[14px] font-semibold transition-opacity ${!canClaim ? 'cursor-not-allowed bg-[#222] text-text-dim' : 'cursor-pointer bg-linear-to-r from-[#7c3aed] to-accent-purple text-white'} ${claiming ? 'opacity-70' : 'opacity-100'}`}
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
