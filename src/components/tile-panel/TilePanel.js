'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { playSound } from '@/lib/sound';
import InteractionsPanel from '../InteractionsPanel';
import ShareButton from './ShareButton';
import { VerificationBadge } from './VerificationBadge';
import VerifyGithubButton from './VerifyGithubButton';
import VerifyXButton from './VerifyXButton';
import NeighborNetworkPanel from './NeighborNetworkPanel';
import { getSizedImageUrl, truncateAddress, truncateTx, CONTRACT_ADDRESS, CHAIN_ID, CATEGORY_COLORS, X_ICON_STYLE } from './utils';

const CATEGORIES = ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'];
const VERIFIED_COLOR = '#22c55e';

export default function TilePanel({ tile, onClose, onTileUpdated, onConnectionsChange, onNavigateToTile, allTiles, onAction }) {
  const isClaimed = !!tile.name;
  const row = Math.floor(tile.id / 256);
  const col = tile.id % 256;

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingSpanImage, setUploadingSpanImage] = useState(false);
  const [imagePreview, setImagePreview] = useState(tile.imageUrl || null);
  const [formData, setFormData] = useState({
    name: tile.name || '',
    description: tile.description || '',
    category: tile.category || 'other',
    url: tile.url || '',
    xHandle: tile.xHandle || '',
    avatar: tile.avatar || '🤖',
    color: tile.color || '#3b82f6',
  });

  // Owned tile IDs (for interactions — which tiles can I act from?)
  const [ownedTileIds, setOwnedTileIds] = useState([]);

  // Check if connected wallet owns this tile (supports smart wallets via on-chain check)
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    if (!address || tile.id == null) { setIsOwner(false); return; }
    // Quick local check first
    if (tile.owner && address.toLowerCase() === tile.owner.toLowerCase()) {
      setIsOwner(true);
      return;
    }
    // Reset immediately while checking on-chain (prevents stale flash from previous tile)
    setIsOwner(false);
    // On-chain ownerOf check (handles smart wallets where DB owner ≠ useAccount address)
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/check-owner?wallet=${address}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setIsOwner(!!d.isOwner); })
      .catch(() => { if (!cancelled) setIsOwner(false); });
    return () => { cancelled = true; };
  }, [address, tile.id, tile.owner]);

  // Once isOwner is confirmed, find all tiles owned by the same DB owner address
  // This handles smart wallets: isOwner is true (on-chain), tile.owner is the proxy address
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

  // Also try direct EOA match (non-smart-wallet case)
  useEffect(() => {
    if (!address || isOwner) return; // skip if isOwner already handled it
    const addrLower = address.toLowerCase();
    fetch('/api/grid').then(r => r.json()).then(d => {
      const ids = Object.values(d.tiles || {})
        .filter(t => t.owner && t.owner.toLowerCase() === addrLower)
        .map(t => t.id);
      if (ids.length > 0) setOwnedTileIds(ids);
    }).catch(() => {});
  }, [address, isOwner]);

  function handleEditStart() {
    setFormData({
      name: tile.name || '',
      description: tile.description || '',
      category: tile.category || 'other',
      url: tile.url || '',
      xHandle: tile.xHandle || '',
      avatar: tile.avatar || '🤖',
      color: tile.color || '#3b82f6',
    });
    setImagePreview(tile.imageUrl || null);
    setSaveMsg('');
    setEditing(true);
  }

  // Compress image client-side before uploading (handles huge phone camera photos)
  function compressImage(file, maxDim = 1024, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
      img.src = url;
    });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSaveMsg('Error: Please upload a PNG, JPG, or WebP image');
      return;
    }

    setUploadingImage(true);
    setSaveMsg('');

    try {
      // Compress client-side — handles 20MB phone photos gracefully
      const compressed = file.size > 500 * 1024
        ? await compressImage(file, 1024, 0.80)
        : file;

      const formPayload = new FormData();
      formPayload.append('image', compressed, file.name);

      const res = await fetch(`/api/tiles/${tile.id}/image`, {
        method: 'POST',
        headers: { 'x-wallet': address },
        body: formPayload,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setImagePreview(data.imageUrl + '?t=' + Date.now());
      playSound('upload-success');
      setSaveMsg('✓ Image uploaded');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setSaveMsg('');
  }

  async function handleSpanImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !tile.spanId) return;

    if (!file.type.startsWith('image/')) {
      setSaveMsg('Error: Please upload a PNG, JPG, or WebP image');
      return;
    }

    setUploadingSpanImage(true);
    setSaveMsg('');
    try {
      const compressed = file.size > 4 * 1024 * 1024
        ? await compressImage(file, 2048, 0.9)
        : file;

      const formPayload = new FormData();
      formPayload.append('image', compressed, file.name);
      formPayload.append('spanId', String(tile.spanId));
      formPayload.append('topLeftId', String(tile.id));

      const res = await fetch(`/api/spans/${tile.spanId}/image`, {
        method: 'POST',
        headers: { 'x-wallet': address },
        body: formPayload,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Span upload failed (${res.status})`);
      }

      const data = await res.json();
      const tileSlice = data.slices?.find(slice => slice.tileId === tile.id);
      if (tileSlice?.imageUrl) {
        setImagePreview(tileSlice.imageUrl + '?t=' + Date.now());
      }
      setSaveMsg('✓ Span image uploaded and sliced across the rectangle');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setUploadingSpanImage(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    try {
      // Build timestamped message (rounded to 5-min window)
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;

      // Sign with wallet
      const sig = await signMessageAsync({ message });

      // Clean xHandle (strip leading @)
      const cleanHandle = formData.xHandle.startsWith('@')
        ? formData.xHandle.slice(1)
        : formData.xHandle;

      const res = await fetch(`/api/tiles/${tile.id}/metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          category: formData.category,
          url: formData.url,
          xHandle: cleanHandle,
          avatar: formData.avatar,
          color: formData.color,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }

      const { tile: updatedTile } = await res.json();
      setSaveMsg('✓ Saved');
      setEditing(false);
      // Notify parent to refresh tile data
      if (onTileUpdated) onTileUpdated(tile.id, updatedTile);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#0a0a0f',
    border: '1px solid #2a2a3e',
    borderRadius: 6,
    padding: '8px 10px',
    color: '#fff',
    fontSize: 13,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    display: 'block',
  };

  // Reactive mobile detection — updates on resize, SSR-safe
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const panelStyle = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '80vh',
        overflowY: 'auto',
        background: '#0f0f1a',
        borderTop: '1px solid #1a1a2e',
        borderLeft: 'none',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        zIndex: 100,
        borderRadius: '12px 12px 0 0',
      }
    : {
        width: 320,
        background: '#0f0f1a',
        borderLeft: '1px solid #1a1a2e',
        padding: 24,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      };

  return (
    <div style={panelStyle}>
      {/* Header row — sticky so close button is always reachable */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0f0f1a', paddingBottom: 8, marginBottom: -8,
      }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          Tile #{tile.id} · ({col}, {row})
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isClaimed && isOwner && !editing && (
            <button
              onClick={handleEditStart}
              className="btn-retro"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >✏️ Edit</button>
          )}
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#b0b8c4', fontSize: 24, cursor: 'pointer',
            lineHeight: 1, padding: '4px 8px',
          }}>×</button>
        </div>
      </div>

      {/* Save success message */}
      {saveMsg && !editing && (
        <div style={{
          background: saveMsg.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${saveMsg.startsWith('Error') ? '#ef444440' : '#22c55e40'}`,
          borderRadius: 6, padding: '8px 12px', fontSize: 13,
          color: saveMsg.startsWith('Error') ? '#ef4444' : '#22c55e',
        }}>{saveMsg}</div>
      )}

      {isClaimed ? (
        editing ? (
          /* ── EDIT FORM ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>Edit Tile Metadata</div>

            {/* Avatar + Color row */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Avatar Emoji</label>
                <input
                  type="text"
                  value={formData.avatar}
                  maxLength={2}
                  onChange={e => setFormData(f => ({ ...f, avatar: e.target.value }))}
                  style={{ ...inputStyle, fontSize: 24, textAlign: 'center', padding: '6px 10px' }}
                  placeholder="🤖"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  />
                  <input
                    type="text"
                    value={formData.color}
                    maxLength={7}
                    onChange={e => setFormData(f => ({ ...f, color: e.target.value }))}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>

            {/* Tile Image Upload */}
            <div>
              <label style={labelStyle}>Tile Image</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 8,
                  border: '2px dashed #2a2a3e',
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#0a0a0f',
                  flexShrink: 0,
                }}>
                  {imagePreview ? (
                    <img src={imagePreview} alt="Tile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 32 }}>{formData.avatar || '🤖'}</span>
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className={uploadingImage ? 'btn-loading' : ''} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: uploadingImage ? '#333' : '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    color: '#94a3b8',
                    cursor: uploadingImage ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                  }}>
                    {uploadingImage && <span className="spinner" style={{ width: 12, height: 12, borderWidth: '1.5px' }} />}
                    {uploadingImage ? 'Uploading…' : imagePreview ? '📷 Change Image' : '📷 Upload Image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>PNG, JPG, or WebP • Max 5MB • Auto-crops to square</span>
                </div>
              </div>
            </div>

            {tile.spanId && (
              <div>
                <label style={labelStyle}>Multi-Tile Span Image</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{
                    display: 'inline-block',
                    background: uploadingSpanImage ? '#333' : '#0c4a6e',
                    border: '1px solid #0369a1',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 12,
                    color: '#e0f2fe',
                    cursor: uploadingSpanImage ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                  }}>
                    {uploadingSpanImage && <span className="spinner" style={{ width: 12, height: 12, borderWidth: '1.5px' }} />}
                    {uploadingSpanImage ? 'Uploading span…' : '🧩 Upload spanning image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleSpanImageUpload}
                      disabled={uploadingSpanImage}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Max 10MB • Fits to rectangle ratio • Slices into individual NFT images automatically</span>
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label style={labelStyle}>Name</label>
              <input
                type="text"
                value={formData.name}
                maxLength={50}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                style={inputStyle}
                placeholder="My Agent"
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description <span style={{ color: '#94a3b8', textTransform: 'none' }}>({formData.description.length}/200)</span></label>
              <textarea
                value={formData.description}
                maxLength={200}
                rows={3}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
                placeholder="What does your agent do?"
              />
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={formData.category}
                onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c} style={{ background: '#0a0a0f', color: '#fff' }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Website */}
            <div>
              <label style={labelStyle}>Website URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={e => setFormData(f => ({ ...f, url: e.target.value }))}
                style={inputStyle}
                placeholder="https://myagent.ai"
              />
            </div>

            {/* X Handle */}
            <div>
              <label style={labelStyle}>X Handle</label>
              <input
                type="text"
                value={formData.xHandle}
                onChange={e => setFormData(f => ({ ...f, xHandle: e.target.value }))}
                style={inputStyle}
                placeholder="@myagent"
              />
            </div>

            {/* Error message */}
            {saveMsg && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid #ef444440',
                borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ef4444',
              }}>{saveMsg}</div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`btn-retro btn-retro-primary ${saving ? 'btn-loading' : ''}`}
                style={{ flex: 1, fontSize: 13, padding: '10px 0' }}
              >
                {saving && <span className="spinner" />}
                {saving ? 'Signing in wallet…' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="btn-retro"
                style={{ flex: 1, fontSize: 13, padding: '10px 0' }}
              >Cancel</button>
            </div>

            <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
              Saving requires a wallet signature. No gas needed.
            </p>
          </div>
        ) : (
          /* ── DISPLAY MODE ── */
          <>
            {/* Agent card */}
            <div style={{
              background: '#1a1a2e',
              borderRadius: 12,
              padding: 20,
              textAlign: 'center',
              border: `1px solid ${tile.color || '#333'}33`,
            }}>
              {tile.imageUrl ? (
                <img
                  src={getSizedImageUrl(tile.imageUrl, 256)}
                  alt={tile.name || 'Tile image'}
                  style={{
                    width: '100%', maxWidth: 256, aspectRatio: '1 / 1', borderRadius: 16,
                    objectFit: 'cover', display: 'block',
                    margin: '0 auto 12px', border: '1px solid #2a2a3e',
                  }}
                />
              ) : (
                <div style={{ fontSize: 48, marginBottom: 8 }}>{tile.avatar || '🤖'}</div>
              )}
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tile.name}</h2>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginTop: 8, fontSize: 12, color: '#b0b8c4',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: tile.status === 'online' ? '#22c55e' : tile.status === 'busy' ? '#f59e0b' : '#ef4444',
                }} />
                {tile.status || 'unknown'}
              </div>
            </div>

            {/* Category */}
            {tile.category && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: `${CATEGORY_COLORS[tile.category] || '#333'}22`,
                border: `1px solid ${CATEGORY_COLORS[tile.category] || '#333'}44`,
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                color: CATEGORY_COLORS[tile.category] || '#888',
                alignSelf: 'flex-start',
              }}>
                {tile.category}
              </div>
            )}

            {/* Description */}
            {tile.description && (
              <p style={{ margin: 0, fontSize: 14, color: '#d1d5db', lineHeight: 1.6 }}>
                {tile.description}
              </p>
            )}

            {/* Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tile.url && (
                <a href={tile.url} target="_blank" rel="noopener" style={{
                  color: '#3b82f6', fontSize: 13, textDecoration: 'none',
                }}>
                  🔗 {tile.url}
                </a>
              )}
              {(tile.xHandle || (tile.xVerified && tile.xHandleVerified)) && (
                <a href={`https://x.com/${tile.xHandleVerified || tile.xHandle}`} target="_blank" rel="noopener" style={{
                  color: '#94a3b8', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={X_ICON_STYLE}>𝕏</span> @{tile.xHandleVerified || tile.xHandle}
                  <VerificationBadge verified={tile.xVerified} title={tile.xVerified ? 'X/Twitter identity verified' : 'X/Twitter identity not verified'} />
                </a>
              )}
              {/* Owner-only unverified GitHub nudge; keep this out of public social rows unless intentionally redesigning the panel. */}
              {(tile.githubUsername || isOwner) && (
                tile.githubUsername ? (
                  <a href={`https://github.com/${tile.githubUsername}`} target="_blank" rel="noopener" style={{
                    color: '#94a3b8', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>🐙 @{tile.githubUsername}</span>
                    <VerificationBadge verified={tile.githubVerified} title={tile.githubVerified ? 'GitHub identity verified' : 'GitHub identity not verified'} />
                  </a>
                ) : (
                  <div style={{
                    color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span>🐙 GitHub</span>
                    <VerificationBadge verified={false} title="GitHub identity not verified" />
                  </div>
                )
              )}
            </div>

            {/* Owner + tx hash details */}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Owner address — links to basescan + OpenSea profile */}
              {tile.owner ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Owner:</span>
                  <a
                    href={`https://basescan.org/address/${tile.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b82f6', textDecoration: 'none', fontFamily: 'monospace' }}
                  >
                    {truncateAddress(tile.owner)}
                  </a>
                  <a
                    href={`https://opensea.io/${tile.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on OpenSea"
                    style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 10 }}
                  >
                    OS
                  </a>
                </div>
              ) : (
                <span style={{ color: '#94a3b8' }}>Owner: demo</span>
              )}

              {/* Claim tx hash */}
              {tile.txHash ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Tx:</span>
                  <a
                    href={`https://basescan.org/tx/${tile.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b82f6', textDecoration: 'none', fontFamily: 'monospace' }}
                  >
                    {truncateTx(tile.txHash)}
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Tx:</span>
                  <span style={{ color: '#94a3b8' }}>—</span>
                </div>
              )}
            </div>

            {/* Edit prompt for owner */}
            {isOwner && (
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                🔑 You own this tile — click ✏️ Edit to update its info
              </div>
            )}

            {/* Full-res image download link */}
            {tile.imageUrl && (
              <a
                href={getSizedImageUrl(tile.imageUrl, 512)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: '#111122', border: '1px solid #2a2a3e', borderRadius: 8,
                  padding: '10px 12px', fontSize: 13, color: '#e2e8f0',
                  textDecoration: 'none', fontWeight: 500,
                }}
              >
                🖼️ Open full-resolution image
              </a>
            )}

            {/* OpenSea — single button: "List for Sale" if owner, "View on OpenSea" otherwise */}
            {CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' && (
              <div>
                <a
                  href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${tile.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-retro"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    textDecoration: 'none', width: '100%', fontSize: 13,
                    color: isOwner ? '#a855f7' : '#3b82f6',
                    borderColor: isOwner ? '#a855f744' : '#3b82f644',
                  }}
                >
                  {isOwner ? '💰 List for Sale' : '◇ View on OpenSea'}
                </a>
              </div>
            )}

            {/* GitHub Verification button — owner only */}
            {isOwner && !tile.githubVerified && (
              <VerifyGithubButton tile={tile} address={address} onVerified={() => {
                // Refresh tile data
                if (onTileUpdated) {
                  fetch(`/api/tiles/${tile.id}`)
                    .then(r => r.json())
                    .then(updated => onTileUpdated(tile.id, updated))
                    .catch(() => {});
                }
              }} />
            )}
            {isOwner && tile.githubVerified && (
              <div style={{ fontSize: 12, color: VERIFIED_COLOR, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                🐙 GitHub verified as @{tile.githubUsername}
              </div>
            )}

            {/* X/Twitter Verification button — owner only */}
            {isOwner && !tile.xVerified && (
              <VerifyXButton tile={tile} address={address} onVerified={() => {
                // Refresh tile data
                if (onTileUpdated) {
                  fetch(`/api/tiles/${tile.id}`)
                    .then(r => r.json())
                    .then(updated => onTileUpdated(tile.id, updated))
                    .catch(() => {});
                }
              }} />
            )}
            {isOwner && tile.xVerified && tile.xHandleVerified && (
              <div style={{ fontSize: 12, color: VERIFIED_COLOR, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={X_ICON_STYLE}>𝕏</span> Verified as @{tile.xHandleVerified}
              </div>
            )}

            {/* Neighbor Network */}
            {tile.id != null && (
              <NeighborNetworkPanel
                tile={tile}
                address={address}
                isOwner={isOwner}
                onConnectionsChange={onConnectionsChange}
                onNavigateToTile={onNavigateToTile}
              />
            )}

            {/* Interactions */}
            {tile.id != null && (
              <InteractionsPanel
                tile={tile}
                address={address}
                ownedTiles={ownedTileIds}
                isOwner={isOwner}
                allTiles={allTiles}
                onAction={onAction}
              />
            )}

            {/* Share button */}
            <ShareButton tileId={tile.id} />
          </>
        )
      ) : (
        /* ── UNCLAIMED ── */
        <>
          <div style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            border: '1px dashed #333',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📍</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#9ca3af' }}>Unclaimed</h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Position ({col}, {row})
            </p>
          </div>

          <button style={{
            width: '100%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            border: 'none',
            color: '#fff',
            padding: '14px 0',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
          }}>
            Claim This Tile — $1.00
          </button>

          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
            Pay with USDC on Base via x402.<br />
            No signup required. Just a wallet.
          </p>
        </>
      )}
    </div>
  );
}
