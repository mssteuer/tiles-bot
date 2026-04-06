'use client';

import { useState, useEffect } from 'react';
import { useSignMessage } from 'wagmi';

export default function TowerDefensePanel({ tile, address, isOwner, tdInvasions = [] }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    fetch('/api/games/tower-defense')
      .then(r => r.json())
      .then(d => {
        setLeaderboard(d.leaderboard || []);
        setStats(d.stats || null);
      })
      .catch(() => {});
  }, [tdInvasions.length]);

  if (!isOwner) return null;

  // Is THIS tile currently under invasion?
  const activeInvasion = tdInvasions.find(inv => inv.tile_id === tile.id);

  // Can this tile defend a different invaded tile? (any active invasion)
  const canDefendOthers = tdInvasions.length > 0 && !activeInvasion;

  async function handleRepel(invasion) {
    setLoading(true);
    setMsg('');
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const msgText = `tiles.bot:tower-defense:repel:${invasion.id}:${tile.id}:${timestamp}`;
      const sig = await signMessageAsync({ message: msgText });
      const res = await fetch('/api/games/tower-defense/repel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invasionId: invasion.id,
          defenderTileId: tile.id,
          wallet: address,
          message: msgText,
          signature: sig,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Repel failed');
      setMsg('🛡️ Invader repelled!');
      fetch('/api/games/tower-defense')
        .then(r => r.json())
        .then(d => {
          setLeaderboard(d.leaderboard || []);
          setStats(d.stats || null);
        })
        .catch(() => {});
    } catch (e) {
      setMsg(e.message || 'Repel failed');
    } finally {
      setLoading(false);
    }
  }

  const timeLeft = (expiresAt) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return '0m';
    const mins = Math.ceil(ms / 60000);
    return `${mins}m`;
  };

  return (
    <div className="mt-4 rounded border border-border-bright bg-surface-2 p-3">
      <div className="mb-2 text-[13px] font-semibold text-text">👾 Tower Defense</div>

      {activeInvasion ? (
        <div className="mb-3">
          <div className="mb-1 rounded bg-red-900/30 border border-red-600/40 px-2 py-1.5 text-[12px] text-red-400 font-semibold">
            ⚠️ Your tile is under attack! {timeLeft(activeInvasion.expires_at)} left
          </div>
          <div className="text-[11px] text-text-dim mb-2">
            Use your tile to repel — or ask a neighbor for help!
          </div>
          <button
            onClick={() => handleRepel(activeInvasion)}
            disabled={loading}
            className="w-full rounded bg-red-600 py-1.5 text-[12px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? 'Repelling…' : '🛡️ Repel Invader!'}
          </button>
        </div>
      ) : tdInvasions.length > 0 ? (
        <div className="mb-3">
          <div className="text-[12px] text-text-dim mb-2">
            {tdInvasions.length} tile{tdInvasions.length > 1 ? 's are' : ' is'} under attack! Help defend:
          </div>
          {tdInvasions.slice(0, 3).map(inv => (
            <div key={inv.id} className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] text-red-400 font-semibold flex-1">
                👾 Tile #{inv.tile_id} ({timeLeft(inv.expires_at)} left)
              </span>
              <button
                onClick={() => handleRepel(inv)}
                disabled={loading}
                className="rounded bg-red-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? '…' : '🛡️ Defend'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 text-[12px] text-text-dim">
          No active invasions. NPC invaders spawn every 30 minutes. Defend your tile to earn 🛡️ points!
        </div>
      )}

      {msg && <div className="mb-2 text-[12px] text-accent-blue">{msg}</div>}

      {stats && (
        <div className="mb-2 text-[11px] text-text-dim">
          {stats.total} invasions total &bull; {stats.repelled} repelled &bull; {stats.survived} survived
        </div>
      )}

      {leaderboard && leaderboard.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-text-dim uppercase tracking-wide">Top Defenders</div>
          {leaderboard.slice(0, 5).map((entry, i) => (
            <div key={entry.tileId ?? i} className="flex items-center gap-2 py-0.5">
              <span className="text-[11px] text-text-dim w-4">{i + 1}.</span>
              <span className="text-[11px] text-text font-mono truncate flex-1">
                {entry.name || `Tile #${entry.tileId}`}
              </span>
              <span className="text-[11px] text-accent-blue font-semibold">{entry.defenses} 🛡️</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
