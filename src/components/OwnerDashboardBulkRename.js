'use client';

import { useMemo, useState, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useRouter } from 'next/navigation';
import { isUnnamedTile } from '@/lib/tileUtils';

function applyNameTemplate(template, tileId) {
  return template.replace(/#\{\s*id\s*\}/g, String(tileId)).trim();
}

function supportsPerTileNames(template) {
  return /#\{\s*id\s*\}/.test(template);
}

const BATCH_SIZE = 50; // API limit per request

export default function OwnerDashboardBulkRename({ ownerAddress, initialTiles }) {
  const router = useRouter();
  const { address: connectedAddress, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [tiles, setTiles] = useState(initialTiles || []);
  const [selectedTileIds, setSelectedTileIds] = useState([]);
  const [nameInput, setNameInput] = useState('My Bot Fleet');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);

  const unnamedTileIds = useMemo(() => tiles.filter(isUnnamedTile).map(t => t.id), [tiles]);
  const selectedCount = selectedTileIds.length;
  const canSubmit = useMemo(() => (
    selectedCount > 0 &&
    !submitting &&
    isConnected &&
    connectedAddress?.toLowerCase() === ownerAddress.toLowerCase() &&
    nameInput.trim()
  ), [selectedCount, submitting, isConnected, connectedAddress, ownerAddress, nameInput]);

  function setMessage(msg, isError = false) {
    setStatus(msg);
    setStatusError(isError);
  }

  function toggleTile(tileId) {
    setSelectedTileIds(prev =>
      prev.includes(tileId)
        ? prev.filter(id => id !== tileId)
        : [...prev, tileId].sort((a, b) => a - b)
    );
  }

  function selectAllUnnamed() {
    setSelectedTileIds(unnamedTileIds);
    setMessage(`Selected ${unnamedTileIds.length} unnamed tile${unnamedTileIds.length === 1 ? '' : 's'}.`);
  }

  function clearSelection() {
    setSelectedTileIds([]);
    setMessage('Selection cleared.');
  }

  const refreshTiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/owner/${ownerAddress}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.tiles) setTiles(data.tiles);
    } catch { /* ignore */ }
  }, [ownerAddress]);

  async function handleBulkRename(e) {
    e.preventDefault();
    if (!selectedTileIds.length) {
      setMessage('Select at least one tile to rename.', true);
      return;
    }

    const sortedIds = [...selectedTileIds].sort((a, b) => a - b);

    // Build per-tile update objects
    const updates = sortedIds.map(id => ({
      id,
      name: applyNameTemplate(nameInput, id),
    }));

    const emptyNames = updates.filter(u => !u.name);
    if (emptyNames.length) {
      setMessage('Template produces empty names for some tiles. Adjust the template.', true);
      return;
    }

    if (supportsPerTileNames(nameInput)) {
      setMessage('Per-tile templates are not compatible with the signed batch endpoint. Use one shared name for the selected tiles.', true);
      return;
    }

    if (!isConnected || !connectedAddress) {
      setMessage('Connect the owner wallet to rename tiles.', true);
      return;
    }

    if (connectedAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      setMessage('Connected wallet does not match this owner dashboard.', true);
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: updates.length });
    setMessage('');

    let totalUpdated = 0;
    const allErrors = [];

    try {
      // Batch in groups of BATCH_SIZE (API limit is 50)
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const firstName = batch[0]?.name;
        const sameNameForBatch = batch.every(update => update.name === firstName);
        if (!sameNameForBatch) {
          allErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} uses multiple names, which /api/tiles/batch-update does not support`);
          setProgress({ done: Math.min(i + BATCH_SIZE, updates.length), total: updates.length });
          continue;
        }

        const tileIds = batch.map(update => update.id).sort((a, b) => a - b);
        const timestamp = Math.floor(Date.now() / 1000);
        const message = `tiles.bot:batch-update:${tileIds.join(',')}:${timestamp}`;
        const signature = await signMessageAsync({ message });

        const res = await fetch('/api/tiles/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: connectedAddress,
            tileIds,
            metadata: { name: firstName },
            signature,
            message,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          allErrors.push(data?.error || `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (${res.status})`);
        } else {
          totalUpdated += data?.updated || 0;
          if (data?.errors?.length) {
            allErrors.push(...data.errors.map(err => `Tile #${err.id ?? err.tileId}: ${err.error}`));
          }
        }

        setProgress({ done: Math.min(i + BATCH_SIZE, updates.length), total: updates.length });
      }

      await refreshTiles();
      router.refresh();
      setSelectedTileIds([]);
      setProgress(null);

      if (allErrors.length) {
        setMessage(`Renamed ${totalUpdated} tile${totalUpdated === 1 ? '' : 's'} with ${allErrors.length} issue${allErrors.length === 1 ? '' : 's'}: ${allErrors.slice(0, 3).join('; ')}`, true);
      } else {
        setMessage(`Renamed ${totalUpdated} tile${totalUpdated === 1 ? '' : 's'} successfully. ✓`);
      }
    } catch (err) {
      setProgress(null);
      setMessage(err.message || 'Bulk rename failed.', true);
    } finally {
      setSubmitting(false);
    }
  }

  // Preview: show what the first few tiles would be renamed to
  const previewNames = useMemo(() => {
    if (!selectedTileIds.length) return [];
    const ids = selectedTileIds.slice(0, 3);
    return ids.map(id => ({
      id,
      name: applyNameTemplate(nameInput, id),
    }));
  }, [selectedTileIds, nameInput]);

  return (
    <div className="mb-8 rounded-2xl border border-border-dim bg-surface-alt p-5">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-text">Bulk rename tiles</h2>
          <p className="mt-1 text-[13px] text-text-light">
            Select unnamed tiles and apply the same name to all selected tiles in one signed batch request.
          </p>
        </div>
        <div className="text-right text-[12px] text-text-dim">
          <div>{unnamedTileIds.length} unnamed · {tiles.length} total</div>
          <div>{isConnected && connectedAddress ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}` : 'Wallet not connected'}</div>
        </div>
      </div>

      {/* Selection controls */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllUnnamed}
          className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-[13px] font-semibold text-accent-blue transition hover:bg-accent-blue/15"
          disabled={!unnamedTileIds.length || submitting}
        >
          Select all unnamed tiles
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg border border-border-dim bg-surface-2 px-3 py-2 text-[13px] font-semibold text-text transition hover:border-border-bright"
          disabled={!selectedCount || submitting}
        >
          Clear selection
        </button>
        <div className="flex items-center rounded-lg border border-border-dim bg-surface-2 px-3 py-2 text-[13px] text-text-light">
          Selected: <span className="ml-1 font-semibold text-text">{selectedCount}</span>
        </div>
      </div>

      {/* Rename form */}
      <form onSubmit={handleBulkRename} className="mb-5 space-y-4 rounded-xl border border-border-dim bg-surface-2 p-4">
        <label className="block text-[13px] text-text-light">
          <span className="mb-1 block">Name</span>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="My Bot Fleet"
            className="w-full rounded-lg border border-border-dim bg-surface-dark px-3 py-2 text-[14px] text-text outline-none transition focus:border-accent-blue/50"
          />
        </label>

        {/* Preview */}
        {previewNames.length > 0 && (
          <div className="text-[12px] text-text-dim">
            Preview: {previewNames.map(p => `Tile #${p.id} → "${p.name}"`).join(', ')}
            {selectedTileIds.length > 3 && ` … and ${selectedTileIds.length - 3} more`}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-[13px] font-semibold text-accent-green transition hover:bg-accent-green/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? `⏳ Renaming… ${progress ? `${progress.done}/${progress.total}` : ''}`
              : `Rename ${selectedCount || 0} tile${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>

      {/* Progress bar */}
      {progress && (
        <div className="mb-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-dark">
            <div
              className="h-full rounded-full bg-accent-blue transition-all duration-300"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-text-dim">{progress.done} / {progress.total} tiles</div>
        </div>
      )}

      {/* Status message */}
      {status && (
        <div className={`mb-5 rounded-lg border px-3 py-2 text-[13px] ${statusError ? 'border-accent-red/25 bg-accent-red/10 text-accent-red' : 'border-accent-green/25 bg-accent-green/10 text-accent-green'}`}>
          {status}
        </div>
      )}

      <div className="rounded-xl border border-border-dim bg-surface-dark p-4 text-[13px] text-text-light">
        Use <span className="font-semibold text-text">Select all unnamed tiles</span> to target default tile names automatically, then run one signed batch rename for the current selection.
      </div>
    </div>
  );
}
