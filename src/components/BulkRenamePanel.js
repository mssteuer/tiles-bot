'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';

/**
 * BulkRenamePanel — lets the owner rename multiple unnamed tiles in one shot.
 *
 * Strategy options:
 *  1. Template — apply a name template like "Bot #{{id}}" to every unnamed tile
 *  2. Custom name — same name for all selected tiles (useful for branding)
 *
 * Uses POST /api/tiles/batch-update with EIP-191 wallet signature.
 */
export default function BulkRenamePanel({ tiles, ownerAddress }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Selection
  // Tiles with default auto-generated names (e.g. "Tile #1234") — exact match only to avoid
  // misclassifying intentionally named tiles like "Tile #MyCustomBot".
  const unnamedTiles = tiles.filter(t => !t.name || /^Tile #\d+$/.test(t.name));
  const allIds = tiles.map(t => t.id);
  const unnamedIds = unnamedTiles.map(t => t.id);

  const [selectedIds, setSelectedIds] = useState(unnamedIds);
  const [selectMode, setSelectMode] = useState('unnamed'); // 'unnamed' | 'all' | 'custom'

  // Name strategy
  const [strategy, setStrategy] = useState('template'); // 'template' | 'custom'
  const [template, setTemplate] = useState('Bot #{{id}}');
  const [customName, setCustomName] = useState('');

  // UI state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null); // { updated, skipped, errors }
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const isOwnerConnected = isConnected && address?.toLowerCase() === ownerAddress?.toLowerCase();

  function applySelectMode(mode) {
    setSelectMode(mode);
    setResult(null);
    setError(null);
    if (mode === 'unnamed') setSelectedIds(unnamedIds);
    else if (mode === 'all') setSelectedIds(allIds);
    else setSelectedIds([]); // custom: user picks manually via checkboxes (future)
  }

  function toggleTile(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setResult(null);
    setError(null);
  }

  function resolveNameForTile(tile) {
    if (strategy === 'template') {
      return template
        .replace(/\{\{id\}\}/g, tile.id)
        .replace(/\{\{x\}\}/g, tile.x ?? '')
        .replace(/\{\{y\}\}/g, tile.y ?? '');
    }
    return customName.trim();
  }

  async function handleBulkRename() {
    if (!isOwnerConnected) return;
    if (selectedIds.length === 0) {
      setError('No tiles selected.');
      return;
    }
    if (strategy === 'custom' && !customName.trim()) {
      setError('Please enter a custom name.');
      return;
    }
    if (strategy === 'template' && !template.trim()) {
      setError('Please enter a name template.');
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      // Chunk into batches of 500 to stay well within the 1,000 limit
      const CHUNK = 500;
      const chunks = [];
      for (let i = 0; i < selectedIds.length; i += CHUNK) {
        chunks.push(selectedIds.slice(i, i + CHUNK));
      }

      let totalUpdated = 0;
      let totalSkipped = 0;
      const allErrors = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        setProgress({ done: ci * CHUNK, total: selectedIds.length });

        const sortedIds = [...chunk].sort((a, b) => a - b);
        const ts = Math.floor(Date.now() / 1000);
        const idsStr = sortedIds.join(',');
        const message = `tiles.bot:batch-update:${idsStr}:${ts}`;

        const sig = await signMessageAsync({ message }).catch(e => {
          setError(`Wallet signature rejected: ${e.message || e}`);
          return null;
        });
        if (!sig) { setBusy(false); setProgress(null); return; }

        const sampleTile = tiles.find(t => t.id === sortedIds[0]);
        const resolvedName = resolveNameForTile(sampleTile || { id: sortedIds[0] });
        const payload = {
          wallet: address,
          tileIds: sortedIds,
          signature: sig,
          message,
        };

        if (strategy === 'template') {
          payload.updates = sortedIds.map(tileId => {
            const tile = tiles.find(t => t.id === tileId);
            return {
              id: tileId,
              name: resolveNameForTile(tile || { id: tileId }),
            };
          });
        } else {
          payload.metadata = { name: resolvedName };
        }

        const res = await fetch('/api/tiles/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || `Batch update failed (${res.status})`);
          setBusy(false);
          setProgress(null);
          return;
        }
        totalUpdated += data.updated || 0;
        totalSkipped += data.skipped || 0;
        if (data.errors) allErrors.push(...data.errors);
      }

      setProgress({ done: selectedIds.length, total: selectedIds.length });
      setResult({ updated: totalUpdated, skipped: totalSkipped, errors: allErrors });
      router.refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  // Compact summary for collapsed state
  const unnamedCount = unnamedIds.length;

  return (
    <div className="mt-6 rounded-xl border border-border-dim bg-surface-alt">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div>
          <p className="text-[14px] font-semibold text-text">🏷️ Bulk Rename Tiles</p>
          <p className="text-[12px] text-text-dim">
            {unnamedCount > 0
              ? `${unnamedCount} unnamed tile${unnamedCount !== 1 ? 's' : ''} ready to rename`
              : 'All tiles have custom names'}
          </p>
        </div>
        <span className="text-[18px] text-text-dim select-none">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-border-dim px-6 py-5 space-y-5">
          {!isOwnerConnected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-400">
              Connect wallet <span className="font-mono">{ownerAddress.slice(0, 6)}…{ownerAddress.slice(-4)}</span> to use bulk rename.
            </div>
          )}

          {/* Selection scope */}
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-text-dim">Select Tiles</p>
            <div className="flex flex-wrap gap-2">
              {[
                { mode: 'unnamed', label: `Unnamed only (${unnamedCount})` },
                { mode: 'all', label: `All tiles (${allIds.length})` },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => applySelectMode(mode)}
                  disabled={busy}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    selectMode === mode
                      ? 'border-accent-blue bg-accent-blue/20 text-accent-blue'
                      : 'border-border-dim bg-surface-dark text-text-dim hover:border-accent-blue/50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="flex items-center text-[12px] text-text-dim">
                {selectedIds.length} selected
              </span>
            </div>
          </div>

          {/* Name strategy */}
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-text-dim">Name Strategy</p>
            <div className="flex gap-2 mb-3">
              {[
                { s: 'template', label: 'Template' },
                { s: 'custom', label: 'Same Name for All' },
              ].map(({ s, label }) => (
                <button
                  key={s}
                  onClick={() => { setStrategy(s); setResult(null); setError(null); }}
                  disabled={busy}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    strategy === s
                      ? 'border-accent-green bg-accent-green/20 text-accent-green'
                      : 'border-border-dim bg-surface-dark text-text-dim hover:border-accent-green/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {strategy === 'template' ? (
              <div>
                <label className="mb-1 block text-[12px] text-text-dim">
                  Template <span className="text-text-light">(use <code className="rounded bg-surface-dark px-1">{'{{id}}'}</code>, <code className="rounded bg-surface-dark px-1">{'{{x}}'}</code>, or <code className="rounded bg-surface-dark px-1">{'{{y}}'}</code>)</span>
                </label>
                <input
                  type="text"
                  value={template}
                  onChange={e => { setTemplate(e.target.value); setResult(null); setError(null); }}
                  disabled={busy}
                  placeholder="Bot #{{id}}"
                  className="w-full rounded-lg border border-border-dim bg-surface-dark px-3 py-2 font-mono text-[13px] text-text focus:border-accent-blue focus:outline-none"
                />
                {template && selectedIds.length > 0 && (
                  <p className="mt-1 text-[11px] text-text-dim">
                    Preview: "{resolveNameForTile(tiles.find(t => t.id === selectedIds[0]) || { id: selectedIds[0] ?? 123 })}"
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[12px] text-text-dim">Name (applied to all selected tiles)</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => { setCustomName(e.target.value); setResult(null); setError(null); }}
                  disabled={busy}
                  maxLength={64}
                  placeholder="e.g. MAKE Agent"
                  className="w-full rounded-lg border border-border-dim bg-surface-dark px-3 py-2 text-[13px] text-text focus:border-accent-blue focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Error / result */}
          {error && (
            <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-[13px] text-accent-red">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-3 text-[13px] text-accent-green">
              ✅ Updated <strong>{result.updated}</strong> tile{result.updated !== 1 ? 's' : ''}.
              {result.skipped > 0 && <span className="text-text-dim"> {result.skipped} skipped.</span>}
              {result.errors?.length > 0 && (
                <span className="text-accent-red"> {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}.</span>
              )}
              <span className="block mt-1 text-[11px] text-text-dim">Tile list refreshed automatically after completion.</span>
            </div>
          )}

          {/* Progress */}
          {busy && progress && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-text-dim">
                <span>Renaming tiles…</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-dark">
                <div
                  className="h-full rounded-full bg-accent-blue transition-all"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={handleBulkRename}
            disabled={busy || !isOwnerConnected || selectedIds.length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-6 py-3 text-[14px] font-bold transition-colors ${
              busy || !isOwnerConnected || selectedIds.length === 0
                ? 'cursor-not-allowed border-border-dim bg-surface-dark text-text-dim'
                : 'border-accent-blue bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'
            }`}
          >
            {busy ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Renaming…
              </>
            ) : (
              `Rename ${selectedIds.length} Tile${selectedIds.length !== 1 ? 's' : ''}`
            )}
          </button>

          <p className="text-[11px] text-text-dim">
            Your wallet will prompt you to sign. No gas is required — this is a free metadata update.
          </p>
        </div>
      )}
    </div>
  );
}
