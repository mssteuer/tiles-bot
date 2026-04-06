'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

const GRID_SIZE = 256;
const STEPS = ['configure', 'upload', 'processing', 'ready'];

function getRectTileIds(topLeftId, width, height) {
  const col = topLeftId % GRID_SIZE;
  const row = Math.floor(topLeftId / GRID_SIZE);
  if (col + width > GRID_SIZE || row + height > GRID_SIZE) return null;
  const ids = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) ids.push((row + r) * GRID_SIZE + (col + c));
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

  // Use the grid tiles data passed from page.js — it has owner info.
  // (The per-tile API returns OpenSea metadata which lacks owner.)
  const tileSource = tiles;

  const availability = useMemo(() => {
    if (!tileIds) return { missing: [], foreign: [], ok: [] };
    const missing = [];
    const foreign = [];
    const ok = [];
    for (const id of tileIds) {
      const tile = tileSource[id] || tileSource[String(id)];
      if (!tile || !tile.owner) missing.push(id);
      else if (!address || tile.owner?.toLowerCase() !== address.toLowerCase()) foreign.push(id);
      else ok.push(id);
    }
    return { missing, foreign, ok };
  }, [tileIds, tileSource, address]);

  const canCreate = !!address && !!tileIds && tileIds.length >= 2 && tileIds.length <= 256 && availability.missing.length === 0 && availability.foreign.length === 0;
  const canUpload = !!createdSpan && !!uploadFile && !uploading;
  const uploadDisabled = uploading || step === 'processing' || step === 'ready';

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
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()}>
      <div className="retro-modal w-[540px] max-w-[95vw]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="m-0 text-[20px]">Create Multi-Tile Span</h2>
            <p className="mt-1 text-[13px] text-text-light">Create the rectangle, upload one image, then wait for the span to become ready.</p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent px-1 text-[24px] text-text-light">×</button>
        </div>

        <div className="mb-4 flex gap-2 text-[12px]">
          {STEPS.map((label) => {
            const active = label === step;
            const done = STEPS.indexOf(label) < STEPS.indexOf(step);
            return (
              <div
                key={label}
                className={`rounded-[2px] px-2.5 py-1.5 capitalize ${active ? 'border border-[#7c3aed] bg-[#7c3aed] text-white' : done ? 'border border-green-500/40 bg-green-500/20 text-white' : 'border border-border bg-surface-2 text-text-dim'}`}
              >
                {label}
              </div>
            );
          })}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-light">Width</span>
            <input
              type="number"
              min="1"
              max="16"
              value={width}
              disabled={!!createdSpan}
              onChange={e => setWidth(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))}
              className="retro-input w-full"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-light">Height</span>
            <input
              type="number"
              min="1"
              max="16"
              value={height}
              disabled={!!createdSpan}
              onChange={e => setHeight(Math.max(1, Math.min(16, parseInt(e.target.value || '1', 10))))}
              className="retro-input w-full"
            />
          </label>
        </div>

        <div className="mb-4 text-[13px] text-text">Top-left tile: #{topLeftId} · Rectangle: {width}×{height} · {tileIds?.length || 0} tiles</div>

        <div
          className="mb-4 inline-grid gap-0.5 rounded-[2px] border border-border bg-surface p-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(width, 1)}, 28px)` }}
        >
          {(tileIds || []).map(id => {
            const bad = availability.missing.includes(id) || availability.foreign.includes(id);
            return <div key={id} title={`Tile #${id}`} className={`h-7 w-7 rounded-[2px] border ${bad ? 'border-red-500/60 bg-red-500/35' : 'border-green-500/60 bg-green-500/35'}`} />;
          })}
        </div>

        {availability.missing.length > 0 && <div className="mb-2 text-[13px] text-red-400">All tiles must already be claimed before creating a span. Missing: {availability.missing.length}</div>}
        {availability.foreign.length > 0 && <div className="mb-2 text-[13px] text-red-400">All tiles must be owned by your connected wallet. Foreign tiles: {availability.foreign.length}</div>}
        {tileIds && tileIds.length < 2 && <div className="mb-2 text-[13px] text-red-400">Minimum size is 2×1 or 1×2.</div>}

        {createdSpan && (
          <div className="mb-4 rounded-[2px] border border-border bg-surface px-3 py-3 text-[13px]">
            <div>Span #{createdSpan.id} created.</div>
            <div>Status: <strong>{createdSpan.status}</strong></div>
          </div>
        )}

        {(step === 'upload' || step === 'processing' || step === 'ready') && (
          <div className="mb-4">
            {uploadFile && (
              <div className="mb-2 overflow-hidden rounded-[2px] border border-border">
                <img src={URL.createObjectURL(uploadFile)} alt="Preview" className="max-h-[200px] w-full object-cover" />
              </div>
            )}
            <label className={`btn-retro inline-flex items-center gap-1.5 ${uploadDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              {uploadFile ? '📷 Change Image' : '📷 Choose Image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                disabled={uploadDisabled}
                className="hidden"
              />
            </label>
            <div className="mt-1.5 text-[11px] text-text-dim">PNG, JPG, or WebP. The image covers the full {width}×{height} rectangle, then sliced per tile.</div>
          </div>
        )}

        {step === 'processing' && (
          <div className="btn-loading mb-3 rounded-[2px] border border-blue-400/20 bg-blue-500/8 px-3.5 py-2.5 text-center text-[13px] text-blue-400">
            <span className="spinner spinner-blue-light" />
            Processing and slicing tiles{polling ? '…' : '.'}
          </div>
        )}

        {step === 'ready' && <div className="mb-3 text-[13px] text-accent-green">✅ Spanning image is ready.</div>}
        {error && <div className="mb-3 text-[13px] text-red-400">{error}</div>}

        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} className="btn-retro px-4 py-2.5">{step === 'ready' ? 'Done' : 'Cancel'}</button>
          {!createdSpan && (
            <button
              onClick={handleCreate}
              disabled={!canCreate || working}
              className={`btn-retro btn-retro-primary px-4 py-2.5 ${working ? 'btn-loading' : ''} ${!canCreate ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}
            >
              {working && <span className="spinner" />}
              {working ? 'Creating span…' : 'Create Span'}
            </button>
          )}
          {createdSpan && step !== 'ready' && (
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className={`btn-retro btn-retro-primary px-4 py-2.5 ${uploading ? 'btn-loading' : ''} ${!canUpload ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}
            >
              {uploading && <span className="spinner" />}
              {uploading ? 'Uploading image…' : 'Upload Image'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
