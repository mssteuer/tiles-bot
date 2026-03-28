'use client';

import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

const GRID_SIZE = 256;

function getRectTileIds(topLeftId, width, height) {
  const col = topLeftId % GRID_SIZE;
  const row = Math.floor(topLeftId / GRID_SIZE);
  if (col + width > GRID_SIZE || row + height > GRID_SIZE) return null;
  const ids = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      ids.push((row + r) * GRID_SIZE + (col + c));
    }
  }
  return ids;
}

export default function MultiTileSpanModal({ topLeftId, tiles, onClose, onCreated }) {
  const { address } = useAccount();
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const tileIds = useMemo(() => getRectTileIds(topLeftId, width, height), [topLeftId, width, height]);

  const availability = useMemo(() => {
    if (!tileIds) return { missing: [], foreign: [], ok: [] };
    const missing = [];
    const foreign = [];
    const ok = [];
    for (const id of tileIds) {
      const tile = tiles[id];
      if (!tile) missing.push(id);
      else if (!address || tile.owner?.toLowerCase() !== address.toLowerCase()) foreign.push(id);
      else ok.push(id);
    }
    return { missing, foreign, ok };
  }, [tileIds, tiles, address]);

  const canCreate = !!address && !!tileIds && tileIds.length >= 2 && tileIds.length <= 256 && availability.missing.length === 0 && availability.foreign.length === 0;

  async function handleCreate() {
    if (!canCreate) return;
    setWorking(true);
    setError('');
    try {
      const res = await fetch('/api/spans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topLeftId, width, height, wallet: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create span');
      onCreated?.(data.span);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: 480, maxWidth: '95vw', background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 16, padding: 24, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Create Multi-Tile Span</h2>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>Reserve a rectangular owner-only area for one spanning image. Assumption: use Shift + right-click on an owned tile to open this quickly from the grid.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#777', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#888' }}>Width</span>
            <input type="number" min="1" max="16" value={width} onChange={e => setWidth(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))} style={{ background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#888' }}>Height</span>
            <input type="number" min="1" max="16" value={height} onChange={e => setHeight(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))} style={{ background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px' }} />
          </label>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: '#aaa' }}>
          Top-left tile: #{topLeftId} · Rectangle: {width}×{height} · {tileIds?.length || 0} tiles
        </div>

        <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${Math.max(width, 1)}, 28px)`, gap: 2, padding: 8, background: '#111827', borderRadius: 8, marginBottom: 16 }}>
          {(tileIds || []).map(id => {
            const bad = availability.missing.includes(id) || availability.foreign.includes(id);
            return <div key={id} title={`Tile #${id}`} style={{ width: 28, height: 28, borderRadius: 4, background: bad ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)', border: `1px solid ${bad ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}` }} />;
          })}
        </div>

        {availability.missing.length > 0 && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>All tiles must already be claimed before creating a span. Missing: {availability.missing.length}</div>}
        {availability.foreign.length > 0 && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>All tiles must be owned by your connected wallet. Foreign tiles: {availability.foreign.length}</div>}
        {tileIds && tileIds.length < 2 && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>Minimum size is 2×1 or 1×2.</div>}
        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #374151', color: '#ddd', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={!canCreate || working} style={{ background: !canCreate ? '#1f2937' : '#7c3aed', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, cursor: !canCreate ? 'not-allowed' : 'pointer' }}>{working ? 'Creating…' : 'Create Span'}</button>
        </div>
      </div>
    </div>
  );
}
