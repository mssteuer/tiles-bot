'use client';

import { useState, useEffect } from 'react';
import { useSignMessage } from 'wagmi';

function areTilesManhattanAdjacent(tileId1, tileId2) {
  const GRID = 256;
  const col1 = tileId1 % GRID;
  const row1 = Math.floor(tileId1 / GRID);
  const col2 = tileId2 % GRID;
  const row2 = Math.floor(tileId2 / GRID);
  return Math.abs(col1 - col2) + Math.abs(row1 - row2) === 1;
}

export default function CaptureTheFlagPanel({ tile, address, isOwner, ctfFlag, onCaptured }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    fetch('/api/games/capture-flag')
      .then(r => r.json())
      .then(d => setLeaderboard(d.leaderboard || []))
      .catch(() => {});
  }, [ctfFlag?.id]);

  if (!isOwner) return null;

  const activeFlag = ctfFlag;
  const isAdjacentToFlag = activeFlag ? areTilesManhattanAdjacent(tile.id, activeFlag.flagTileId) : false;

  async function handleCapture() {
    if (!activeFlag) return;
    setLoading(true);
    setMsg('');
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const msgText = `tiles.bot:capture-flag:${activeFlag.id}:${tile.id}:${timestamp}`;
      const sig = await signMessageAsync({ message: msgText });
      const res = await fetch('/api/games/capture-flag/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flagEventId: activeFlag.id,
          capturingTileId: tile.id,
          wallet: address,
          message: msgText,
          signature: sig,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Capture failed');
      setMsg('🚩 Flag captured!');
      if (onCaptured) onCaptured(data);
      fetch('/api/games/capture-flag')
        .then(r => r.json())
        .then(d => setLeaderboard(d.leaderboard || []))
        .catch(() => {});
    } catch (e) {
      setMsg(e.message || 'Capture failed');
    } finally {
      setLoading(false);
    }
  }

  const timeLeft = activeFlag ? Math.max(0, Math.round((new Date(activeFlag.expiresAt).getTime() - Date.now()) / 60000)) : 0;

  return (
    <div className="mt-4 rounded border border-border-bright bg-surface-2 p-3">
      <div className="mb-2 text-[13px] font-semibold text-text">🚩 Capture the Flag</div>

      {activeFlag ? (
        <div className="mb-3">
          <div className="text-[12px] text-text-dim mb-1">
            Flag on <span className="text-text font-semibold">Tile #{activeFlag.flagTileId}</span>
            {' '}&bull; {timeLeft}m remaining
          </div>
          {isAdjacentToFlag ? (
            <button
              onClick={handleCapture}
              disabled={loading}
              className="w-full rounded bg-red-600 py-1.5 text-[12px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? 'Capturing…' : '🚩 Capture!'}
            </button>
          ) : (
            <div className="text-[11px] text-text-dim">Your tile must be adjacent to Tile #{activeFlag.flagTileId} to capture.</div>
          )}
        </div>
      ) : (
        <div className="mb-3 text-[12px] text-text-dim">No active flag right now. Flags spawn every 30 minutes.</div>
      )}

      {msg && <div className="mb-2 text-[12px] text-accent-blue">{msg}</div>}

      {leaderboard && leaderboard.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-text-dim uppercase tracking-wide">Weekly Leaderboard</div>
          {leaderboard.slice(0, 5).map((entry, i) => (
            <div key={entry.wallet} className="flex items-center gap-2 py-0.5">
              <span className="text-[11px] text-text-dim w-4">{i + 1}.</span>
              <span className="text-[11px] text-text font-mono truncate flex-1">{entry.wallet.slice(0, 8)}…{entry.wallet.slice(-4)}</span>
              <span className="text-[11px] text-accent-blue font-semibold">{entry.captures} 🚩</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
