'use client';

import { useState, useEffect } from 'react';
import { useSignMessage } from 'wagmi';
import { getSizedImageUrl } from './utils';

const NEIGHBOR_STATUS_DOT_CLASS = {
  online: 'bg-accent-green',
  busy: 'bg-accent-amber',
  offline: 'bg-accent-red',
};

function NeighborNetworkPanel({ tile, address, isOwner, onConnectionsChange, onNavigateToTile }) {
  const { signMessageAsync } = useSignMessage();
  const [neighbors, setNeighbors] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownedTiles, setOwnedTiles] = useState([]);
  const [selectedFromTile, setSelectedFromTile] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [showTilePicker, setShowTilePicker] = useState(false);
  const [tileSearch, setTileSearch] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [processingReqId, setProcessingReqId] = useState(null);

  async function loadNeighbors() {
    try {
      const res = await fetch(`/api/tiles/${tile.id}/connect`);
      if (!res.ok) return;
      const data = await res.json();
      setNeighbors(data.neighbors || []);
    } catch { /* ignore */ }
  }

  async function loadPendingRequests() {
    try {
      const res = await fetch(`/api/tiles/${tile.id}/requests`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingRequests(data.requests || []);
    } catch { /* ignore */ }
  }

  async function loadOwnedTiles() {
    if (!address) return;
    try {
      const res = await fetch('/api/grid');
      if (!res.ok) return;
      const data = await res.json();
      const allTiles = data.tiles || {};
      const owned = Object.values(allTiles).filter(
        t => t.owner && t.owner.toLowerCase() === address.toLowerCase() && t.id !== tile.id
      );
      setOwnedTiles(owned);
      if (owned.length === 1) setSelectedFromTile(owned[0]);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (tile.id != null) {
      Promise.all([loadNeighbors(), loadPendingRequests(), loadOwnedTiles()])
        .finally(() => setLoading(false));
    }
  }, [tile.id, address]);

  async function handleSendRequest(fromTile) {
    setSendingRequest(true);
    setErrMsg('');
    try {
      const ts = Math.floor(Date.now() / 1000);
      const message = `tiles.bot:connect:${fromTile.id}:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });

      const res = await fetch(`/api/tiles/${tile.id}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ fromTileId: fromTile.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      setRequestSent(true);
      setShowTilePicker(false);
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setSendingRequest(false);
    }
  }

  async function handleRequestAction(reqId, action) {
    setProcessingReqId(reqId);
    setErrMsg('');
    try {
      const ts = Math.floor(Date.now() / 1000);
      const message = `tiles.bot:connect:${tile.id}:${reqId}:${ts}`;
      const sig = await signMessageAsync({ message });

      const res = await fetch(`/api/tiles/${tile.id}/requests/${reqId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Action failed (${res.status})`);
      }
      await Promise.all([loadNeighbors(), loadPendingRequests()]);
      if (action === 'accept' && onConnectionsChange) {
        fetch('/api/connections').then(r => r.json()).then(d => onConnectionsChange(d.connections || [])).catch(() => {});
      }
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setProcessingReqId(null);
    }
  }

  async function handleDisconnect(neighborId) {
    try {
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });

      const res = await fetch(`/api/tiles/${tile.id}/connect`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ targetId: neighborId }),
      });
      if (!res.ok) return;
      await loadNeighbors();
      if (onConnectionsChange) {
        fetch('/api/connections').then(r => r.json()).then(d => onConnectionsChange(d.connections || [])).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  if (loading) return null;

  const connectedIds = new Set(neighbors.map(n => n.tileId));
  const filteredOwnedTiles = ownedTiles.filter(t => {
    if (connectedIds.has(t.id)) return false;
    if (!tileSearch) return true;
    const q = tileSearch.toLowerCase();
    return (t.name || '').toLowerCase().includes(q) || String(t.id).includes(q);
  });

  const canSendRequest = !!address && ownedTiles.length > 0 && !isOwner && !requestSent;

  return (
    <div className="flex flex-col gap-1.5">
      {isOwner && pendingRequests.length > 0 && (
        <div className="mb-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-amber">
            📬 {pendingRequests.length} pending request{pendingRequests.length > 1 ? 's' : ''}
          </div>
          {pendingRequests.map(req => (
            <div
              key={req.id}
              className="flex items-center gap-1.5 rounded-md border border-accent-amber/20 bg-surface-2 px-2 py-1.5 text-[11px]"
            >
              {req.fromTile.imageUrl ? (
                <img
                  src={getSizedImageUrl(req.fromTile.imageUrl, 32)}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="shrink-0 text-[14px]">{req.fromTile.avatar || '🤖'}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-text">
                  #{req.fromTileId} {req.fromTile.name}
                </div>
                {req.fromTile.category && (
                  <div className="text-[10px] text-text-light">{req.fromTile.category}</div>
                )}
              </div>
              <button
                onClick={() => handleRequestAction(req.id, 'accept')}
                disabled={processingReqId === req.id}
                title="Accept"
                className={`rounded px-2 py-[3px] text-[10px] font-semibold ${processingReqId === req.id ? 'cursor-not-allowed opacity-50' : ''} bg-accent-green text-black`}
              >
                ✓
              </button>
              <button
                onClick={() => handleRequestAction(req.id, 'reject')}
                disabled={processingReqId === req.id}
                title="Reject"
                className={`rounded border border-slate-600 px-2 py-[3px] text-[10px] font-semibold text-text-dim ${processingReqId === req.id ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                ✗
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[12px] font-semibold text-text-dim">
        <span>🔗 Connections ({neighbors.length})</span>
      </div>

      {neighbors.length > 0 && (
        <div className="flex flex-col gap-1">
          {neighbors.map(n => {
            const statusDotClass = NEIGHBOR_STATUS_DOT_CLASS[n.status] || 'bg-accent-red';
            return (
              <div
                key={n.tileId}
                className="flex items-center gap-1.5 rounded-md border border-border-dim bg-surface-2 px-2 py-[5px] text-[11px]"
              >
                {n.imageUrl ? (
                  <img src={n.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <span className="w-7 shrink-0 text-center text-[14px]">{n.avatar || '🤖'}</span>
                )}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => onNavigateToTile && onNavigateToTile(n.tileId)}
                  title="Fly to this tile"
                >
                  <div className="truncate font-medium text-blue-300">
                    #{n.tileId} {n.name || 'Unnamed'}
                  </div>
                  {n.label && <div className="text-[10px] text-text-light">{n.label}</div>}
                </div>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass}`} title={n.status} />
                {isOwner && (
                  <button
                    onClick={() => handleDisconnect(n.tileId)}
                    title="Disconnect"
                    className="border-none bg-transparent px-0.5 py-0 text-[13px] leading-none text-text-dim"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {neighbors.length === 0 && (
        <div className="text-center text-[11px] text-text-dim">No connections yet.</div>
      )}

      {errMsg && <div className="text-center text-[10px] text-accent-red-light">{errMsg}</div>}

      {canSendRequest && !showTilePicker && (
        <button
          onClick={() => {
            if (ownedTiles.length === 1) {
              handleSendRequest(ownedTiles[0]);
            } else {
              setShowTilePicker(true);
              setErrMsg('');
            }
          }}
          disabled={sendingRequest}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-blue/30 bg-surface-2 px-3 py-2 text-[12px] font-medium text-accent-blue ${sendingRequest ? 'cursor-not-allowed' : ''}`}
        >
          {sendingRequest ? 'Sending…' : '🤝 Connect with this Bot'}
        </button>
      )}

      {requestSent && (
        <div className="flex items-center justify-center gap-1 rounded-lg border border-accent-green/20 bg-accent-green/10 px-3 py-2 text-center text-[12px] text-accent-green">
          ✓ Connection request sent
        </div>
      )}

      {showTilePicker && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-700 bg-surface px-2 py-2">
          <div className="text-[11px] font-semibold text-text-dim">
            Send request from which tile?
          </div>
          {ownedTiles.length > 5 && (
            <input
              placeholder="Search your tiles…"
              value={tileSearch}
              onChange={e => setTileSearch(e.target.value)}
              className="rounded-[5px] border border-slate-700 bg-surface-2 px-2 py-[5px] text-[11px] text-text outline-none"
            />
          )}
          <div className="flex max-h-40 flex-col gap-[3px] overflow-y-auto">
            {filteredOwnedTiles.map(t => (
              <button
                key={t.id}
                onClick={() => handleSendRequest(t)}
                disabled={sendingRequest}
                className="flex w-full items-center gap-1.5 rounded-[5px] border border-border-dim bg-surface-2 px-2 py-[5px] text-left text-[11px] text-text"
              >
                {t.imageUrl ? (
                  <img
                    src={getSizedImageUrl(t.imageUrl, 32)}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-[3px] object-cover"
                  />
                ) : (
                  <span className="shrink-0 text-[14px]">{t.avatar || '🤖'}</span>
                )}
                <span className="truncate">
                  #{t.id} {t.name || 'Unnamed'}
                </span>
              </button>
            ))}
            {filteredOwnedTiles.length === 0 && (
              <div className="p-2 text-center text-[10px] text-text-dim">
                No available tiles
              </div>
            )}
          </div>
          <button
            onClick={() => { setShowTilePicker(false); setTileSearch(''); setErrMsg(''); }}
            className="rounded-[5px] border border-slate-700 bg-surface-2 px-2 py-[5px] text-[11px] text-text-dim"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default NeighborNetworkPanel;
