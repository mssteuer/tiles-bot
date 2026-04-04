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
import PixelWarsPanel from './PixelWarsPanel';
import { getSizedImageUrl, truncateAddress, truncateTx, CONTRACT_ADDRESS, CHAIN_ID, CATEGORY_COLORS, X_ICON_STYLE } from './utils';

const CATEGORIES = ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'];
const VERIFIED_COLOR = '#22c55e';

function EmbedCodeButton({ tileId }) {
  const [copied, setCopied] = useState(false);
  const [embedCode, setEmbedCode] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/widget/${tileId}/embed-code`);
      const data = await res.json();
      setEmbedCode(data.iframe);
      await navigator.clipboard.writeText(data.iframe);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: generate inline
      const code = `<iframe src="${window.location.origin}/widget/${tileId}" width="256" height="128" frameborder="0" scrolling="no" style="border-radius:12px;overflow:hidden;" title="tiles.bot widget" loading="lazy"></iframe>`;
      setEmbedCode(code);
      try { await navigator.clipboard.writeText(code); } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        className="btn-retro flex w-full items-center justify-center gap-2 text-[13px] border-accent-blue/30 text-accent-blue"
        disabled={loading}
      >
        {loading ? '⏳ Loading…' : copied ? '✅ Copied!' : '🔗 Get Embed Code'}
      </button>
      {embedCode && (
        <textarea
          readOnly
          value={embedCode}
          onClick={e => e.target.select()}
          className="w-full rounded-lg border border-border-bright bg-surface-2 px-3 py-2 text-[11px] font-mono text-text-dim resize-none"
          rows={3}
          style={{ lineHeight: '1.4' }}
        />
      )}
    </div>
  );
}

function withAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return null;
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return `${normalized}${alpha}`;
}

export default function TilePanel({ tile, onClose, onTileUpdated, onConnectionsChange, onNavigateToTile, allTiles, onAction, onClaim }) {
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
  const { signMessageAsync } = useSignMessage();

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

  const [ownedTileIds, setOwnedTileIds] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewStats, setViewStats] = useState(null); // { totalViews, todayViews }
  const [repBreakdown, setRepBreakdown] = useState(null); // { heartbeat, connections, notes, actions, age, identity, profile }

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

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fetch view stats for claimed tiles
  useEffect(() => {
    if (!isClaimed || tile.id == null) return;
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/views`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.totalViews != null) setViewStats({ totalViews: d.totalViews, todayViews: d.todayViews }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isClaimed, tile.id]);

  // Fetch rep breakdown for all claimed tiles (even score=0 to show they're new)
  useEffect(() => {
    if (!isClaimed || tile.id == null) return;
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/rep`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.breakdown) setRepBreakdown(d.breakdown); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isClaimed, tile.id, tile.repScore]);

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
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });
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
      if (onTileUpdated) onTileUpdated(tile.id, updatedTile);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const panelClassName = isMobile
    ? 'fixed bottom-0 left-0 right-0 z-[100] flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-t-[12px] border-t border-border-dim bg-surface-alt p-5'
    : 'flex w-80 flex-col gap-5 overflow-y-auto border-l border-border-dim bg-surface-alt p-6';

  const saveIsError = saveMsg.startsWith('Error');
  const tileStatusClass = tile.status === 'online' ? 'bg-accent-green' : tile.status === 'busy' ? 'bg-accent-amber' : 'bg-accent-red';
  const categoryColor = CATEGORY_COLORS[tile.category] || '#333';
  const tileCardStyle = { background: '#1a1a2e', borderColor: withAlpha(tile.color || '#333333', '33') || '#33333333' };
  const categoryStyle = { background: withAlpha(categoryColor, '22') || 'transparent', borderColor: withAlpha(categoryColor, '44') || 'transparent', color: categoryColor };

  return (
    <div className={panelClassName}>
      <div className="sticky top-0 z-10 -mb-2 flex items-center justify-between bg-surface-alt pb-2">
        <span className="text-[12px] text-text-gray">
          Tile #{tile.id} · ({col}, {row})
        </span>
        <div className="flex items-center gap-2">
          {isClaimed && isOwner && !editing && (
            <button onClick={handleEditStart} className="btn-retro px-[10px] py-1 text-[12px]">✏️ Edit</button>
          )}
          <button onClick={onClose} className="border-none bg-transparent px-2 py-1 text-[24px] leading-none text-slate-400">×</button>
        </div>
      </div>

      {saveMsg && !editing && (
        <div className={`rounded-md border px-3 py-2 text-[13px] ${saveIsError ? 'border-accent-red/25 bg-accent-red/10 text-accent-red' : 'border-accent-green/25 bg-accent-green/10 text-accent-green'}`}>
          {saveMsg}
        </div>
      )}

      {isClaimed ? (
        editing ? (
          <div className="flex flex-col gap-3.5">
            <div className="text-[14px] font-semibold text-text-dim">Edit Tile Metadata</div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Avatar Emoji</label>
                <input
                  type="text"
                  value={formData.avatar}
                  maxLength={2}
                  onChange={e => setFormData(f => ({ ...f, avatar: e.target.value }))}
                  className="w-full rounded-md border border-border-bright bg-surface-dark px-2.5 py-1.5 text-center text-[24px] text-white outline-none"
                  placeholder="🤖"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData(f => ({ ...f, color: e.target.value }))}
                    className="h-9 w-10 cursor-pointer border-none bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    maxLength={7}
                    onChange={e => setFormData(f => ({ ...f, color: e.target.value }))}
                    className="w-full flex-1 rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 font-mono text-[13px] text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Tile Image</label>
              <div className="flex items-center gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border-bright bg-surface-dark">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Tile" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[32px]">{formData.avatar || '🤖'}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-bright bg-surface-2 px-3.5 py-2 text-center text-[12px] text-text-dim ${uploadingImage ? 'btn-loading cursor-not-allowed bg-[#333]' : ''}`}>
                    {uploadingImage && <span className="spinner h-3 w-3 border-[1.5px]" />}
                    {uploadingImage ? 'Uploading…' : imagePreview ? '📷 Change Image' : '📷 Upload Image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[10px] text-text-gray">PNG, JPG, or WebP • Max 5MB • Auto-crops to square</span>
                </div>
              </div>
            </div>

            {tile.spanId && (
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Multi-Tile Span Image</label>
                <div className="flex flex-col gap-1.5">
                  <label className={`inline-block cursor-pointer rounded-md border border-sky-700 bg-sky-900 px-3.5 py-2 text-center text-[12px] text-sky-100 ${uploadingSpanImage ? 'cursor-not-allowed bg-[#333]' : ''}`}>
                    {uploadingSpanImage && <span className="spinner mr-1.5 inline-block h-3 w-3 border-[1.5px]" />}
                    {uploadingSpanImage ? 'Uploading span…' : '🧩 Upload spanning image'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleSpanImageUpload}
                      disabled={uploadingSpanImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[10px] text-text-gray">Max 10MB • Fits to rectangle ratio • Slices into individual NFT images automatically</span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Name</label>
              <input
                type="text"
                value={formData.name}
                maxLength={50}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 text-[13px] text-white outline-none"
                placeholder="My Agent"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">
                Description <span className="normal-case text-text-dim">({formData.description.length}/200)</span>
              </label>
              <textarea
                value={formData.description}
                maxLength={200}
                rows={3}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                className="min-h-16 w-full resize-y rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 text-[13px] text-white outline-none"
                placeholder="What does your agent do?"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Category</label>
              <select
                value={formData.category}
                onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
                className="w-full cursor-pointer rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 text-[13px] text-white outline-none"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c} className="bg-surface-dark text-white">
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">Website URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={e => setFormData(f => ({ ...f, url: e.target.value }))}
                className="w-full rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 text-[13px] text-white outline-none"
                placeholder="https://myagent.ai"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.8px] text-text-gray">X Handle</label>
              <input
                type="text"
                value={formData.xHandle}
                onChange={e => setFormData(f => ({ ...f, xHandle: e.target.value }))}
                className="w-full rounded-md border border-border-bright bg-surface-dark px-2.5 py-2 text-[13px] text-white outline-none"
                placeholder="@myagent"
              />
            </div>

            {saveMsg && (
              <div className="rounded-md border border-accent-red/25 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red">
                {saveMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`btn-retro btn-retro-primary flex-1 px-0 py-2.5 text-[13px] ${saving ? 'btn-loading' : ''}`}
              >
                {saving && <span className="spinner" />}
                {saving ? 'Signing in wallet…' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="btn-retro flex-1 px-0 py-2.5 text-[13px]"
              >
                Cancel
              </button>
            </div>

            <p className="m-0 text-center text-[11px] text-text-dim">
              Saving requires a wallet signature. No gas needed.
            </p>
          </div>
        ) : (
          <>
            <div
              className="rounded-[12px] border px-5 py-5 text-center"
              style={tileCardStyle}
            >
              {tile.imageUrl ? (
                <img
                  src={getSizedImageUrl(tile.imageUrl, 256)}
                  alt={tile.name || 'Tile image'}
                  className="mx-auto mb-3 block aspect-square w-full max-w-64 rounded-[16px] border border-border-bright object-cover"
                />
              ) : (
                <div className="mb-2 text-[48px]">{tile.avatar || '🤖'}</div>
              )}
              <h2 className="m-0 text-[18px] font-bold">{tile.name}</h2>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-slate-400">
                <span className={`h-2 w-2 rounded-full ${tileStatusClass}`} />
                {tile.status || 'unknown'}
              </div>
            </div>

            {tile.category && (
              <div
                className="inline-flex w-fit items-center gap-1.5 rounded-[20px] border px-3 py-1 text-[12px]"
                style={categoryStyle}
              >
                {tile.category}
              </div>
            )}

            {tile.description && (
              <p className="m-0 text-[14px] leading-[1.6] text-slate-300">{tile.description}</p>
            )}

            <div className="flex flex-col gap-2">
              {tile.url && (
                <a href={tile.url} target="_blank" rel="noopener" className="text-[13px] text-accent-blue no-underline">
                  🔗 {tile.url}
                </a>
              )}
              {(tile.xHandle || (tile.xVerified && tile.xHandleVerified)) && (
                <a
                  href={`https://x.com/${tile.xHandleVerified || tile.xHandle}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1 text-[13px] text-text-dim no-underline"
                >
                  <span style={X_ICON_STYLE}>𝕏</span> @{tile.xHandleVerified || tile.xHandle}
                  <VerificationBadge verified={tile.xVerified} title={tile.xVerified ? 'X/Twitter identity verified' : 'X/Twitter identity not verified'} />
                </a>
              )}
              {(tile.githubUsername || isOwner) && (
                tile.githubUsername ? (
                  <a
                    href={`https://github.com/${tile.githubUsername}`}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 text-[13px] text-text-dim no-underline"
                  >
                    <span>🐙 @{tile.githubUsername}</span>
                    <VerificationBadge verified={tile.githubVerified} title={tile.githubVerified ? 'GitHub identity verified' : 'GitHub identity not verified'} />
                  </a>
                ) : (
                  <div className="flex items-center gap-1 text-[13px] text-text-dim">
                    <span>🐙 GitHub</span>
                    <VerificationBadge verified={false} title="GitHub identity not verified" />
                  </div>
                )
              )}
            </div>

            <div className="mt-auto flex flex-col gap-1 text-[11px] text-text-gray">
              {tile.repScore != null && (
                <div className="flex items-center gap-1.5">
                  <span>
                    {tile.repScore >= 80 ? '⭐' : tile.repScore >= 50 ? '✨' : tile.repScore >= 20 ? '🔹' : '🌱'}
                  </span>
                  <span
                    title={
                      repBreakdown
                        ? [
                            `Reputation score: ${tile.repScore}/100`,
                            `Heartbeat freshness: ${repBreakdown.heartbeat ?? 0} pts`,
                            `Connections: ${repBreakdown.connections ?? 0} pts`,
                            `Notes received: ${repBreakdown.notes ?? 0} pts`,
                            `Actions & emotes: ${repBreakdown.actions ?? 0} pts`,
                            `Age bonus: ${repBreakdown.age ?? 0} pts`,
                            `Verified identity: ${repBreakdown.identity ?? 0} pts`,
                            `Profile completeness: ${repBreakdown.profile ?? 0} pts`,
                          ].join('\n')
                        : tile.repScore === 0
                          ? 'New agent — earn rep through heartbeats, notes, and connections'
                          : 'Reputation score (0–100)'
                    }
                  >
                    Rep {tile.repScore}/100
                  </span>
                </div>
              )}
              {viewStats != null && viewStats.totalViews > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-dim">👁</span>
                  <span>{viewStats.totalViews.toLocaleString()} view{viewStats.totalViews !== 1 ? 's' : ''}</span>
                  {viewStats.todayViews > 0 && (
                    <span className="text-text-dim">(+{viewStats.todayViews} today)</span>
                  )}
                </div>
              )}
              {tile.owner ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-dim">Owner:</span>
                  <a href={`https://basescan.org/address/${tile.owner}`} target="_blank" rel="noopener noreferrer" className="font-mono text-accent-blue no-underline">
                    {truncateAddress(tile.owner)}
                  </a>
                  <a href={`https://opensea.io/${tile.owner}`} target="_blank" rel="noopener noreferrer" title="View on OpenSea" className="text-[10px] text-text-dim no-underline">
                    OS
                  </a>
                </div>
              ) : (
                <span className="text-text-dim">Owner: demo</span>
              )}

              {tile.txHash ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-dim">Tx:</span>
                  <a href={`https://basescan.org/tx/${tile.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-accent-blue no-underline">
                    {truncateTx(tile.txHash)}
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-dim">Tx:</span>
                  <span className="text-text-dim">—</span>
                </div>
              )}
            </div>

            {isOwner && (
              <div className="text-center text-[11px] text-text-gray">
                🔑 You own this tile — click ✏️ Edit to update its info
              </div>
            )}

            {tile.imageUrl && (
              <a
                href={getSizedImageUrl(tile.imageUrl, 512)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-bright bg-surface-2 px-3 py-2 text-[13px] font-medium text-text no-underline"
              >
                🖼️ Open full-resolution image
              </a>
            )}

            {CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' && (
              <div>
                <a
                  href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${tile.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn-retro flex w-full items-center justify-center gap-2 text-[13px] no-underline ${isOwner ? 'border-accent-purple/30 text-accent-purple' : 'border-accent-blue/30 text-accent-blue'}`}
                >
                  {isOwner ? '💰 List for Sale' : '◇ View on OpenSea'}
                </a>
              </div>
            )}

            {isOwner && !tile.githubVerified && (
              <VerifyGithubButton tile={tile} address={address} onVerified={() => {
                if (onTileUpdated) {
                  fetch(`/api/tiles/${tile.id}`)
                    .then(r => r.json())
                    .then(updated => onTileUpdated(tile.id, updated))
                    .catch(() => {});
                }
              }} />
            )}
            {isOwner && tile.githubVerified && (
              <div className="flex items-center justify-center gap-1 text-center text-[12px] text-accent-green">
                🐙 GitHub verified as @{tile.githubUsername}
              </div>
            )}

            {isOwner && !tile.xVerified && (
              <VerifyXButton tile={tile} address={address} onVerified={() => {
                if (onTileUpdated) {
                  fetch(`/api/tiles/${tile.id}`)
                    .then(r => r.json())
                    .then(updated => onTileUpdated(tile.id, updated))
                    .catch(() => {});
                }
              }} />
            )}
            {isOwner && tile.xVerified && tile.xHandleVerified && (
              <div className="flex items-center justify-center gap-1 text-center text-[12px] text-accent-green">
                <span style={X_ICON_STYLE}>𝕏</span> Verified as @{tile.xHandleVerified}
              </div>
            )}

            {tile.id != null && (
              <NeighborNetworkPanel
                tile={tile}
                address={address}
                isOwner={isOwner}
                onConnectionsChange={onConnectionsChange}
                onNavigateToTile={onNavigateToTile}
              />
            )}

            {tile.id != null && isOwner && (
              <PixelWarsPanel
                tile={tile}
                address={address}
                isOwner={isOwner}
                allTiles={allTiles}
                onNavigateToTile={onNavigateToTile}
                onPainted={() => {
                  fetch('/api/grid')
                    .then(r => r.json())
                    .then(d => {
                      if (onTileUpdated && d.tiles?.[tile.id]) onTileUpdated(tile.id, d.tiles[tile.id]);
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('pixelwars:grid-updated', { detail: { pixelWars: d.pixelWars || {} } }));
                      }
                    })
                    .catch(() => {});
                }}
              />
            )}

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

            <ShareButton tileId={tile.id} />
            {isOwner && <EmbedCodeButton tileId={tile.id} />}
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
