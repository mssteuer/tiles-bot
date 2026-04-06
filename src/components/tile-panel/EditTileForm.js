'use client';

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { playSound } from '@/lib/sound';

const CATEGORIES = ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'];

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

export default function EditTileForm({ tile, onSaved, onCancel }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

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

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveMsg('Error: Please upload a PNG, JPG, WebP, or GIF image');
      return;
    }
    const isGif = file.type === 'image/gif';
    if (isGif && file.size > 2 * 1024 * 1024) {
      setSaveMsg('Error: Animated GIFs must be under 2MB');
      return;
    }
    setUploadingImage(true);
    setSaveMsg('');
    try {
      const compressed = isGif ? file : file.size > 500 * 1024 ? await compressImage(file, 1024, 0.80) : file;
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
      const compressed = file.size > 4 * 1024 * 1024 ? await compressImage(file, 2048, 0.9) : file;
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
      const cleanHandle = formData.xHandle.startsWith('@') ? formData.xHandle.slice(1) : formData.xHandle;
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
      onSaved(updatedTile);
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
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
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="hidden"
              />
            </label>
            <span className="text-[10px] text-text-gray">PNG, JPG, WebP • Max 5MB • GIF • Max 2MB • Auto-crops to square (non-GIF)</span>
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
        <div className={`rounded-md border px-3 py-2 text-[12px] ${saveMsg.startsWith('Error') ? 'border-accent-red/25 bg-accent-red/10 text-accent-red' : 'border-accent-green/25 bg-accent-green/10 text-accent-green'}`}>
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
          onClick={onCancel}
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
  );
}
