'use client';

import { useState, useEffect } from 'react';
import { useSignMessage } from 'wagmi';
import { getSizedImageUrl } from './utils';

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
      // Refresh data
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

  // Filter owned tiles for the picker (exclude already-connected or pending)
  const connectedIds = new Set(neighbors.map(n => n.tileId));
  const filteredOwnedTiles = ownedTiles.filter(t => {
    if (connectedIds.has(t.id)) return false;
    if (!tileSearch) return true;
    const q = tileSearch.toLowerCase();
    return (t.name || '').toLowerCase().includes(q) || String(t.id).includes(q);
  });

  const canSendRequest = !!address && ownedTiles.length > 0 && !isOwner && !requestSent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Pending requests (owner only — verified via on-chain ownerOf) */}
      {isOwner && pendingRequests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#f59e0b', fontWeight: 600,
          }}>
            📬 {pendingRequests.length} pending request{pendingRequests.length > 1 ? 's' : ''}
          </div>
          {pendingRequests.map(req => (
            <div key={req.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#111122', borderRadius: 6, padding: '6px 8px',
              border: '1px solid #f59e0b33', fontSize: 11,
            }}>
              {req.fromTile.imageUrl ? (
                <img
                  src={getSizedImageUrl(req.fromTile.imageUrl, 32)}
                  alt=""
                  style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <span style={{ fontSize: 14, flexShrink: 0 }}>{req.fromTile.avatar || '🤖'}</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{req.fromTileId} {req.fromTile.name}
                </div>
                {req.fromTile.category && (
                  <div style={{ color: '#cbd5e1', fontSize: 10 }}>{req.fromTile.category}</div>
                )}
              </div>
              <button
                onClick={() => handleRequestAction(req.id, 'accept')}
                disabled={processingReqId === req.id}
                title="Accept"
                style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none',
                  background: '#22c55e', color: '#000', fontSize: 10, fontWeight: 600,
                  cursor: processingReqId === req.id ? 'not-allowed' : 'pointer',
                  opacity: processingReqId === req.id ? 0.5 : 1,
                }}
              >
                ✓
              </button>
              <button
                onClick={() => handleRequestAction(req.id, 'reject')}
                disabled={processingReqId === req.id}
                title="Reject"
                style={{
                  padding: '3px 8px', borderRadius: 4, border: '1px solid #475569',
                  background: 'transparent', color: '#94a3b8', fontSize: 10, fontWeight: 600,
                  cursor: processingReqId === req.id ? 'not-allowed' : 'pointer',
                  opacity: processingReqId === req.id ? 0.5 : 1,
                }}
              >
                ✗
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: '#94a3b8', fontWeight: 600,
      }}>
        <span>🔗 Connections ({neighbors.length})</span>
      </div>

      {/* Existing connections */}
      {neighbors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {neighbors.map(n => {
            const statusColor = n.status === 'online' ? '#22c55e' : n.status === 'busy' ? '#f59e0b' : '#ef4444';
            return (
              <div key={n.tileId} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#111122', borderRadius: 6, padding: '5px 8px',
                border: '1px solid #1a1a2e', fontSize: 11,
              }}>
                {n.imageUrl ? (
                  <img
                    src={n.imageUrl}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ fontSize: 14, width: 28, textAlign: 'center', flexShrink: 0 }}>{n.avatar || '🤖'}</span>
                )}
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => onNavigateToTile && onNavigateToTile(n.tileId)}
                  title="Fly to this tile"
                >
                  <div style={{ color: '#93c5fd', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{n.tileId} {n.name || 'Unnamed'}
                  </div>
                  {n.label && <div style={{ color: '#cbd5e1', fontSize: 10 }}>{n.label}</div>}
                </div>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} title={n.status} />
                {isOwner && (
                  <button
                    onClick={() => handleDisconnect(n.tileId)}
                    title="Disconnect"
                    style={{
                      background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                      fontSize: 13, padding: '0 2px', lineHeight: 1,
                    }}
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
        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>No connections yet.</div>
      )}

      {/* Error message */}
      {errMsg && <div style={{ color: '#f87171', fontSize: 10, textAlign: 'center' }}>{errMsg}</div>}

      {/* Connect with this Bot button (for non-owners who have tiles) */}
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
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid #3b82f644',
            background: '#111122', color: '#3b82f6', fontSize: 12, fontWeight: 500,
            cursor: sendingRequest ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {sendingRequest ? 'Sending…' : '🤝 Connect with this Bot'}
        </button>
      )}

      {/* Request sent confirmation */}
      {requestSent && (
        <div style={{
          fontSize: 12, color: '#22c55e', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 12px', background: '#22c55e11', borderRadius: 8, border: '1px solid #22c55e33',
        }}>
          ✓ Connection request sent
        </div>
      )}

      {/* Tile picker for users with multiple tiles */}
      {showTilePicker && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '8px',
          background: '#0d0d1a', borderRadius: 8, border: '1px solid #334155',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            Send request from which tile?
          </div>
          {ownedTiles.length > 5 && (
            <input
              placeholder="Search your tiles…"
              value={tileSearch}
              onChange={e => setTileSearch(e.target.value)}
              style={{
                background: '#111122', border: '1px solid #334155', borderRadius: 5,
                padding: '5px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none',
              }}
            />
          )}
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {filteredOwnedTiles.map(t => (
              <button
                key={t.id}
                onClick={() => handleSendRequest(t)}
                disabled={sendingRequest}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#111122', borderRadius: 5, padding: '5px 8px',
                  border: '1px solid #1a1a2e', fontSize: 11, cursor: 'pointer',
                  color: '#e2e8f0', textAlign: 'left', width: '100%',
                }}
              >
                {t.imageUrl ? (
                  <img
                    src={getSizedImageUrl(t.imageUrl, 32)}
                    alt=""
                    style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{t.avatar || '🤖'}</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{t.id} {t.name || 'Unnamed'}
                </span>
              </button>
            ))}
            {filteredOwnedTiles.length === 0 && (
              <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', padding: 8 }}>
                No available tiles
              </div>
            )}
          </div>
          <button
            onClick={() => { setShowTilePicker(false); setTileSearch(''); setErrMsg(''); }}
            style={{
              padding: '5px 8px', borderRadius: 5, border: '1px solid #334155',
              background: '#111122', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}


export default NeighborNetworkPanel;
