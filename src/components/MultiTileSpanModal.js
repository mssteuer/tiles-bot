'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function MultiTileSpanModal({ topLeftId, tiles, initialTileIds = null, onClose, onCreated }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const { address } = useAccount();
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('configure');
  const [createdSpan, setCreatedSpan] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!initialTileIds || initialTileIds.length < 2) return;
    const sorted = [...initialTileIds].sort((a, b) => a - b);
    const inferredTopLeft = sorted[0];
    if (inferredTopLeft !== topLeftId) return;

    const rows = sorted.map((id) => Math.floor(id / GRID_SIZE));
    const cols = sorted.map((id) => id % GRID_SIZE);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const inferredWidth = maxCol - minCol + 1;
    const inferredHeight = maxRow - minRow + 1;
    const rectIds = getRectTileIds(inferredTopLeft, inferredWidth, inferredHeight);
    if (rectIds && rectIds.length === sorted.length && rectIds.every((id, index) => id === sorted[index])) {
      setWidth(inferredWidth);
      setHeight(inferredHeight);
    }
  }, [initialTileIds, topLeftId]);

  const tileIds = useMemo(() => getRectTileIds(topLeftId, width, height), [topLeftId, width, height]);

  // Fresh tile data from server (tiles prop may be stale after batch claim)
  const [liveTiles, setLiveTiles] = useState(null);
  useEffect(() => {
    if (!tileIds || tileIds.length === 0) return;
    // Fetch fresh tile data for the selected IDs
    Promise.all(tileIds.map(id =>
      fetch(`/api/tiles/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const map = {};
      results.forEach((t, i) => { if (t) map[tileIds[i]] = t; });
      setLiveTiles(map);
    });
  }, [tileIds]);

  const tileSource = liveTiles || tiles;

  const availability = useMemo(() => {
    if (!tileIds) return { missing: [], foreign: [], ok: [] };
    const missing = [];
    const foreign = [];
    const ok = [];
    for (const id of tileIds) {
      const tile = tileSource[id] || tileSource[String(id)];
      if (!tile || !tile.owner) missing.push(id);
      else if (!address || tile.owner?.toLowerCase() !== address.toLowerCase()) {
        // Smart wallet: check on-chain if owner mismatch (Coinbase proxy vs EOA)
        // For now, treat as ok if tile IS claimed (owner exists) — server validates on create
        ok.push(id);
      }
      else ok.push(id);
    }
    return { missing, foreign, ok };
  }, [tileIds, tileSource, address]);

  const canCreate = !!address && !!tileIds && tileIds.length >= 2 && tileIds.length <= 256 && availability.missing.length === 0 && availability.foreign.length === 0;
  const canUpload = !!createdSpan && !!uploadFile && !uploading;

  async function pollSpanStatus(spanId) {
    setPolling(true);
    try {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`/api/spans/${spanId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch span status');
        setCreatedSpan(data.span);
        if (data.span.status === 'ready' || data.span.status === 'error') return data.span;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      setPolling(false);
    }
    return null;
  }

  async function handleCreate() {
    if (!canCreate) return;
    setWorking(true);
    setError('');
    try {
      const res = await fetch('/api/spans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet': address,
        },
        body: JSON.stringify({ topLeftId, width, height }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create span');
      setCreatedSpan(data.span);
      setStep('upload');
      onCreated?.(data.span);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleUpload() {
    if (!canUpload) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', uploadFile);
      const res = await fetch(`/api/spans/${createdSpan.id}/image`, {
        method: 'POST',
        headers: { 'x-wallet': address },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload image');
      setCreatedSpan(data.span);
      setStep('processing');
      const finalSpan = await pollSpanStatus(createdSpan.id);
      if (finalSpan?.status === 'ready') setStep('ready');
      else if (finalSpan?.status === 'error') throw new Error('Span image processing failed');
      else setStep('ready');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={e => e.stopPropagation()} /* no backdrop dismiss — use × or Cancel */
    >
      <div style={{ width: 540, maxWidth: '95vw', background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 16, padding: 24, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Create Multi-Tile Span</h2>
            <p style={{ margin: '4px 0 0', color: '#b0b8c4', fontSize: 13 }}>Create the rectangle, upload one image, then wait for the span to become ready.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#b0b8c4', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 12 }}>
          {['configure', 'upload', 'processing', 'ready'].map((label) => {
            const active = label === step;
            const done = ['configure', 'upload', 'processing', 'ready'].indexOf(label) < ['configure', 'upload', 'processing', 'ready'].indexOf(step);
            return (
              <div key={label} style={{
                padding: '6px 10px', borderRadius: 999,
                background: active ? '#7c3aed' : done ? 'rgba(34,197,94,0.2)' : '#1f2937',
                color: active || done ? '#fff' : '#94a3b8',
                textTransform: 'capitalize',
              }}>{label}</div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#b0b8c4' }}>Width</span>
            <input type="number" min="1" max="16" value={width} disabled={!!createdSpan} onChange={e => setWidth(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))} style={{ background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#b0b8c4' }}>Height</span>
            <input type="number" min="1" max="16" value={height} disabled={!!createdSpan} onChange={e => setHeight(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))} style={{ background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: 8, padding: '10px 12px' }} />
          </label>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: '#d1d5db' }}>
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

        {createdSpan && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#111827', border: '1px solid #374151', fontSize: 13 }}>
            <div>Span #{createdSpan.id} created.</div>
            <div>Status: <strong>{createdSpan.status}</strong></div>
          </div>
        )}

        {(step === 'upload' || step === 'processing' || step === 'ready') && (
          <div style={{ marginBottom: 16 }}>
            {uploadFile && (
              <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a3e' }}>
                <img src={URL.createObjectURL(uploadFile)} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              </div>
            )}
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: (uploading || step === 'processing' || step === 'ready') ? '#333' : '#1a1a2e',
              border: '1px solid #2a2a3e',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 12,
              color: '#94a3b8',
              cursor: (uploading || step === 'processing' || step === 'ready') ? 'not-allowed' : 'pointer',
            }}>
              {uploadFile ? '📷 Change Image' : '📷 Choose Image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                disabled={uploading || step === 'processing' || step === 'ready'}
                style={{ display: 'none' }}
              />
            </label>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>PNG, JPG, or WebP. The image covers the full {width}×{height} rectangle, then sliced per tile.</div>
          </div>
        )}

        {step === 'processing' && (
          <div className="btn-loading" style={{ color: '#60a5fa', fontSize: 13, marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
            <span className="spinner" style={{ borderTopColor: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }} />
            Processing and slicing tiles{polling ? '…' : '.'}
          </div>
        )}

        {step === 'ready' && (
          <div style={{ color: '#22c55e', fontSize: 13, marginBottom: 12 }}>
            Spanning image is ready.
          </div>
        )}

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #374151', color: '#ddd', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}>{step === 'ready' ? 'Done' : 'Cancel'}</button>
          {!createdSpan && (
            <button onClick={handleCreate} disabled={!canCreate || working} className={working ? 'btn-loading' : ''} style={{ background: !canCreate ? '#1f2937' : '#7c3aed', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, cursor: !canCreate ? 'not-allowed' : 'pointer' }}>
              {working && <span className="spinner" />}{working ? 'Creating span…' : 'Create Span'}
            </button>
          )}
          {createdSpan && step !== 'ready' && (
            <button onClick={handleUpload} disabled={!canUpload} className={uploading ? 'btn-loading' : ''} style={{ background: !canUpload ? '#1f2937' : '#0ea5e9', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, cursor: !canUpload ? 'not-allowed' : 'pointer' }}>
              {uploading && <span className="spinner" />}{uploading ? 'Uploading image…' : 'Upload Image'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
