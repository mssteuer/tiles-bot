'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { SocialPanel, GamesPanel } from '../InteractionsPanel';
import NeighborNetworkPanel from './NeighborNetworkPanel';
import CaptureTheFlagPanel from './CaptureTheFlagPanel';
import TowerDefensePanel from './TowerDefensePanel';
import EditTileForm from './EditTileForm';
import AboutTab from './AboutTab';
import CustomizeTab from './CustomizeTab';

export default function TilePanel({ tile, onClose, onTileUpdated, onConnectionsChange, onPendingRequestsChange, onNavigateToTile, allTiles, onAction, onClaim, ctfFlag = null, tdInvasions = [] }) {
  const isClaimed = !!tile.name;
  const row = Math.floor(tile.id / 256);
  const col = tile.id % 256;
  const [currentPrice, setCurrentPrice] = useState(null);

  useEffect(() => {
    if (!isClaimed) {
      fetch('/api/stats').then(r => r.json()).then(d => {
        if (d.currentPrice != null) setCurrentPrice(Number(d.currentPrice));
      }).catch(() => {});
    }
  }, [isClaimed, tile.id]);

  const { address } = useAccount();

  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [ownedTileIds, setOwnedTileIds] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [panelTab, setPanelTab] = useState('about');

  // ── Ownership check ──
  useEffect(() => {
    if (!address || tile.id == null) { setIsOwner(false); return; }
    if (tile.owner && address.toLowerCase() === tile.owner.toLowerCase()) {
      setIsOwner(true);
      return;
    }
    setIsOwner(false);
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/check-owner?wallet=${address}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setIsOwner(!!d.isOwner); })
      .catch(() => { if (!cancelled) setIsOwner(false); });
    return () => { cancelled = true; };
  }, [address, tile.id, tile.owner]);

  // ── Owned tiles list ──
  useEffect(() => {
    if (!isOwner || tile.owner == null) { return; }
    const ownerAddr = tile.owner.toLowerCase();
    fetch('/api/grid').then(r => r.json()).then(d => {
      const ids = Object.values(d.tiles || {})
        .filter(t => t.owner && t.owner.toLowerCase() === ownerAddr)
        .map(t => t.id);
      setOwnedTileIds(ids);
    }).catch(() => {});
  }, [isOwner, tile.owner]);

  useEffect(() => {
    if (!address || isOwner) return;
    const addrLower = address.toLowerCase();
    fetch('/api/grid').then(r => r.json()).then(d => {
      const ids = Object.values(d.tiles || {})
        .filter(t => t.owner && t.owner.toLowerCase() === addrLower)
        .map(t => t.id);
      if (ids.length > 0) setOwnedTileIds(ids);
    }).catch(() => {});
  }, [address, isOwner]);

  // ── Mobile detect ──
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const panelClassName = isMobile
    ? 'fixed bottom-0 left-0 right-0 z-[100] flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-t-[12px] border-t border-border-dim bg-surface-alt p-5'
    : 'flex w-80 flex-col gap-5 overflow-y-auto border-l border-border-dim bg-surface-alt p-6';

  const saveIsError = saveMsg.startsWith('Error');

  // Tab definitions — Customize only for owners
  const PANEL_TABS = [
    { id: 'about', icon: 'ℹ️', label: 'About' },
    ...(isOwner ? [{ id: 'customize', icon: '🎨', label: 'Customize' }] : []),
    { id: 'social', icon: '💬', label: 'Social' },
    { id: 'games', icon: '🎮', label: 'Games' },
  ];

  return (
    <div className={panelClassName}>
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 -mb-2 flex items-center justify-between bg-surface-alt pb-2">
        <span className="text-[12px] text-text-gray">
          Tile #{tile.id} · ({col}, {row})
        </span>
        <button onClick={onClose} className="border-none bg-transparent px-2 py-1 text-[24px] leading-none text-slate-400">×</button>
      </div>

      {saveMsg && !editing && (
        <div className={`rounded-md border px-3 py-2 text-[13px] ${saveIsError ? 'border-accent-red/25 bg-accent-red/10 text-accent-red' : 'border-accent-green/25 bg-accent-green/10 text-accent-green'}`}>
          {saveMsg}
        </div>
      )}

      {isClaimed ? (
        editing ? (
          <EditTileForm
            tile={tile}
            onSaved={(updatedTile) => {
              setSaveMsg('✓ Saved');
              setEditing(false);
              if (onTileUpdated) onTileUpdated(tile.id, updatedTile);
              setTimeout(() => setSaveMsg(''), 3000);
            }}
            onCancel={() => { setEditing(false); setSaveMsg(''); }}
          />
        ) : (
          <>
            {/* ── Tab bar ── */}
            <div className="flex border-b border-border-dim">
              {PANEL_TABS.map(t => {
                const active = panelTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setPanelTab(t.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-center transition-colors ${
                      active
                        ? 'border-accent-blue text-text'
                        : 'border-transparent text-text-dim hover:text-text-light'
                    }`}
                  >
                    <span className="text-[14px] leading-none">{t.icon}</span>
                    <span className="text-[12px] font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Tab content ── */}
            {panelTab === 'about' && (
              <AboutTab tile={tile} isOwner={isOwner} />
            )}

            {panelTab === 'customize' && isOwner && (
              <CustomizeTab
                tile={tile}
                onEditStart={() => {
                  setEditing(true);
                  setSaveMsg('');
                }}
                onTileUpdated={onTileUpdated}
              />
            )}

            {panelTab === 'social' && tile.id != null && (
              <div className="flex flex-col gap-4">
                <NeighborNetworkPanel
                  tile={tile}
                  address={address}
                  isOwner={isOwner}
                  onConnectionsChange={onConnectionsChange}
                  onPendingRequestsChange={onPendingRequestsChange}
                  onNavigateToTile={onNavigateToTile}
                />
                <SocialPanel
                  tile={tile}
                  address={address}
                  ownedTiles={ownedTileIds}
                  isOwner={isOwner}
                  allTiles={allTiles}
                  onAction={onAction}
                />
              </div>
            )}

            {panelTab === 'games' && tile.id != null && (
              <div className="flex flex-col gap-4">
                {isOwner && (
                  <CaptureTheFlagPanel
                    tile={tile}
                    address={address}
                    isOwner={isOwner}
                    ctfFlag={ctfFlag}
                    onCaptured={() => {}}
                  />
                )}
                {isOwner && (
                  <TowerDefensePanel
                    tile={tile}
                    address={address}
                    isOwner={isOwner}
                    tdInvasions={tdInvasions}
                  />
                )}
                <GamesPanel
                  tile={tile}
                  address={address}
                  ownedTiles={ownedTileIds}
                  isOwner={isOwner}
                  allTiles={allTiles}
                />
              </div>
            )}
          </>
        )
      ) : (
        <>
          <div className="rounded-[12px] border border-dashed border-[#333] bg-[#1a1a2e] px-8 py-8 text-center">
            <div className="mb-3 text-[48px] opacity-30">📍</div>
            <h2 className="m-0 text-[18px] font-bold text-text-gray">Unclaimed</h2>
            <p className="mt-2 mb-0 text-[13px] text-text-dim">
              Position ({col}, {row})
            </p>
          </div>

          <button
            className="btn-retro btn-retro-primary w-full py-3 text-[15px]"
            onClick={() => onClaim?.(tile.id)}
          >
            Claim This Tile{currentPrice != null ? ` — $${currentPrice < 0.01 ? currentPrice.toPrecision(3) : currentPrice.toFixed(4)} USDC` : ''}
          </button>

          <p className="text-center text-[12px] leading-[1.6] text-text-dim">
            Pay with USDC on Base via x402.<br />
            No signup required. Just a wallet.
          </p>
        </>
      )}
    </div>
  );
}
