'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import VerifyGithubButton from './VerifyGithubButton';
import VerifyXButton from './VerifyXButton';
import { X_ICON_STYLE } from './utils';

export default function CustomizeTab({ tile, onEditStart, onTileUpdated }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [fxBorder, setFxBorder] = useState(tile.effects?.border || '#3b82f6');
  const [fxGlow, setFxGlow] = useState(tile.effects?.glow ?? false);
  const [savingFx, setSavingFx] = useState(false);
  const [fxMsg, setFxMsg] = useState('');

  async function handleSaveEffects() {
    setSavingFx(true);
    setFxMsg('');
    try {
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });
      const effects = fxBorder && fxBorder !== 'none' ? { border: fxBorder, glow: fxGlow } : null;
      const res = await fetch(`/api/tiles/${tile.id}/metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ effects }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      const { tile: updatedTile } = await res.json();
      setFxMsg('✓ Saved');
      if (onTileUpdated) onTileUpdated(tile.id, updatedTile);
      setTimeout(() => setFxMsg(''), 3000);
    } catch (e) {
      setFxMsg(`Error: ${e.message}`);
    } finally {
      setSavingFx(false);
    }
  }

  function handleVerified() {
    if (onTileUpdated) {
      fetch(`/api/tiles/${tile.id}`)
        .then(r => r.json())
        .then(updated => onTileUpdated(tile.id, updated))
        .catch(() => {});
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onEditStart} className="btn-retro w-full py-2.5 text-[13px]">✏️ Edit Tile Info</button>

      {/* Verification */}
      {!tile.githubVerified && (
        <VerifyGithubButton tile={tile} address={address} onVerified={handleVerified} />
      )}
      {tile.githubVerified && (
        <div className="flex items-center justify-center gap-1 text-center text-[12px] text-accent-green">
          🐙 GitHub verified as @{tile.githubUsername}
        </div>
      )}
      {!tile.xVerified && (
        <VerifyXButton tile={tile} address={address} onVerified={handleVerified} />
      )}
      {tile.xVerified && tile.xHandleVerified && (
        <div className="flex items-center justify-center gap-1 text-center text-[12px] text-accent-green">
          <span style={X_ICON_STYLE}>𝕏</span> Verified as @{tile.xHandleVerified}
        </div>
      )}

      {/* Effects */}
      <div className="rounded-lg border border-border-dim bg-surface-2 p-3">
        <div className="mb-3 text-[13px] font-semibold text-text">🎨 Tile Effects</div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Fire', color: '#f97316', glow: true },
              { label: 'Ice', color: '#38bdf8', glow: true },
              { label: 'Gold', color: '#f59e0b', glow: true },
              { label: 'Neon', color: '#4ade80', glow: true },
              { label: 'Purple', color: '#a855f7', glow: true },
              { label: 'White', color: '#f8fafc', glow: false },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => { setFxBorder(preset.color); setFxGlow(preset.glow); }}
                className="rounded border border-border-dim px-2 py-1 text-[11px] text-text-dim hover:border-current"
                style={{ borderColor: preset.color, color: preset.color }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] uppercase tracking-[0.8px] text-text-gray">Border Color</label>
            <input
              type="color"
              value={fxBorder}
              onChange={e => setFxBorder(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="font-mono text-[11px] text-text-dim">{fxBorder}</span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text-dim">
            <input
              type="checkbox"
              checked={fxGlow}
              onChange={e => setFxGlow(e.target.checked)}
              className="accent-accent-blue"
            />
            Glow effect
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveEffects}
              disabled={savingFx}
              className="btn-retro flex-1 px-3 py-1.5 text-[12px]"
            >
              {savingFx ? 'Saving…' : 'Apply Effects'}
            </button>
            <button
              onClick={() => { setFxBorder('#3b82f6'); setFxGlow(false); }}
              className="btn-retro px-3 py-1.5 text-[11px] text-text-gray"
              title="Reset to defaults"
            >
              ↺
            </button>
            <button
              onClick={() => { setFxBorder('none'); setFxGlow(false); }}
              className="btn-retro px-3 py-1.5 text-[11px] text-accent-red"
              title="Remove all effects"
            >
              ✕ Clear
            </button>
          </div>
          {fxMsg && (
            <div className={`rounded px-2 py-1 text-[11px] ${fxMsg.startsWith('Error') ? 'text-accent-red' : 'text-accent-green'}`}>
              {fxMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
