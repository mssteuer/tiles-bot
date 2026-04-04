'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSignMessage } from 'wagmi';

const DEFAULT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const GRID = 256;

function getAdjacentUnclaimed(tileId, allTiles) {
  const col = tileId % GRID;
  const row = Math.floor(tileId / GRID);
  const ids = [];
  if (row > 0) ids.push(tileId - GRID);
  if (row < GRID - 1) ids.push(tileId + GRID);
  if (col > 0) ids.push(tileId - 1);
  if (col < GRID - 1) ids.push(tileId + 1);
  return ids.filter(id => !allTiles[id]);
}

export default function PixelWarsPanel({ tile, address, isOwner, allTiles, onNavigateToTile, onPainted }) {
  const { signMessageAsync } = useSignMessage();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);

  const candidates = useMemo(() => getAdjacentUnclaimed(tile.id, allTiles || {}), [tile.id, allTiles]);

  useEffect(() => {
    if (candidates.length && (selectedTarget == null || !candidates.includes(selectedTarget))) setSelectedTarget(candidates[0]);
    if (!candidates.length) setSelectedTarget(null);
  }, [candidates, selectedTarget]);

  useEffect(() => {
    fetch('/api/games/pixel-wars').then(r => r.json()).then(setSummary).catch(() => {});
  }, [tile.id]);

  if (!isOwner) return null;

  async function handlePaint() {
    if (selectedTarget == null || !address) return;
    setSaving(true);
    setMessage('');
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const authMessage = `tiles.bot:pixel-wars:${tile.id}:${selectedTarget}:${timestamp}`;
      const signature = await signMessageAsync({ message: authMessage });
      const res = await fetch('/api/games/pixel-wars/paint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet': address },
        body: JSON.stringify({ tileId: selectedTarget, sourceTileId: tile.id, color, wallet: address, message: authMessage, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Paint failed');
      setMessage(`Painted tile #${selectedTarget}. The color will expire in 1 hour.`);
      onPainted?.(data);
      fetch('/api/games/pixel-wars').then(r => r.json()).then(setSummary).catch(() => {});
    } catch (err) {
      setMessage(err.message || 'Paint failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-dim bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-text">🎨 Pixel Wars</div>
        <a href="/leaderboard" className="text-[11px] text-accent-blue no-underline">Leaderboard →</a>
      </div>
      <p className="m-0 text-[11px] leading-[1.5] text-text-dim">Color adjacent unclaimed tiles r/place-style. Limit: 5 paints per wallet per hour.</p>
      {candidates.length > 0 ? (
        <>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.8px] text-text-gray">Target tile</div>
            <div className="flex flex-wrap gap-2">
              {candidates.slice(0, 4).map(id => (
                <button key={id} onClick={() => setSelectedTarget(id)} className={`rounded-md border px-2.5 py-1.5 text-[12px] ${selectedTarget === id ? 'border-accent-blue bg-accent-blue/15 text-white' : 'border-border-bright bg-surface-dark text-text-dim'}`}>#{id}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.8px] text-text-gray">Color</div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map(swatch => (
                <button key={swatch} onClick={() => setColor(swatch)} title={swatch} className={`h-7 w-7 rounded-full border-2 ${color === swatch ? 'border-white' : 'border-transparent'}`} style={{ background: swatch }} />
              ))}
            </div>
          </div>
          <button onClick={handlePaint} disabled={saving || selectedTarget == null} className="btn-retro btn-retro-primary w-full py-2 text-[13px]">{saving ? 'Painting…' : `Paint #${selectedTarget}`}</button>
        </>
      ) : (
        <div className="rounded-md border border-border-bright bg-surface-dark px-3 py-2 text-[11px] text-text-dim">No adjacent unclaimed tiles available to paint from this tile.</div>
      )}
      {summary?.leaderboard?.length > 0 && (
        <div className="rounded-md border border-border-bright bg-surface-dark px-3 py-2 text-[11px] text-text-dim">
          <div className="font-semibold text-text">Current leader</div>
          <div>{summary.leaderboard[0].sourceTileName} · {summary.leaderboard[0].uniqueTiles} painted tiles this round</div>
        </div>
      )}
      {selectedTarget != null && <button onClick={() => onNavigateToTile?.(selectedTarget)} className="rounded-md border border-border-bright bg-surface-dark px-3 py-2 text-[11px] text-text-dim">Jump to tile #{selectedTarget}</button>}
      {message && <div className="text-[11px] text-text-dim">{message}</div>}
    </div>
  );
}
