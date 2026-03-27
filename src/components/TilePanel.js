'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

function getSizedImageUrl(url, size) {
  if (!url) return null;
  if (url.includes('?')) return `${url}&size=${size}`;
  return `${url}?size=${size}`;
}

function truncateAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateTx(hash) {
  if (!hash) return null;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function ShareButton({ tileId }) {
  const [copied, setCopied] = useState(false);
  async function handleShare() {
    const url = `https://tiles.bot/?tile=${tileId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleShare}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: '#111122', border: '1px solid #33333366', borderRadius: 8,
        padding: '10px 12px', fontSize: 13,
        color: copied ? '#22c55e' : '#94a3b8',
        fontWeight: 500, cursor: 'pointer', transition: 'color 0.2s',
      }}
    >
      {copied ? '✓ Link Copied!' : '🔗 Share Tile'}
    </button>
  );
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;

const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

const CATEGORIES = ['coding', 'trading', 'research', 'social', 'infrastructure', 'other'];
const VERIFIED_COLOR = '#22c55e';
const UNVERIFIED_COLOR = '#6b7280';
const X_ICON_STYLE = { fontFamily: 'Arial, sans-serif' };

function VerificationBadge({ verified, title }) {
  return (
    <span
      title={title}
      style={{
        color: verified ? VERIFIED_COLOR : UNVERIFIED_COLOR,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      ✓
    </span>
  );
}

/**
 * CopyButton — copy text to clipboard with visual feedback.
 */
function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '4px 8px', borderRadius: 5, border: '1px solid #334155',
        background: copied ? '#22c55e22' : '#1a1a2e', color: copied ? '#22c55e' : '#94a3b8',
        fontSize: 11, cursor: 'pointer', flexShrink: 0,
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

/**
 * VerifyGithubButton — lets the tile owner verify their GitHub identity via a public Gist.
 * 1. Owner clicks → fetches challenge string from GET /api/tiles/:id/verification
 * 2. Owner creates a public Gist with that string, pastes the Gist ID
 * 3. POST /api/tiles/:id/verification with EIP-191 wallet auth → server checks Gist
 */
function VerifyGithubButton({ tile, address, onVerified }) {
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState('idle'); // idle | fetching-challenge | show-challenge | submitting | error | done
  const [challenge, setChallenge] = useState('');
  const [gistId, setGistId] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [errMsg, setErrMsg] = useState('');

  async function handleStart() {
    setStep('fetching-challenge');
    setErrMsg('');
    try {
      const res = await fetch(`/api/tiles/${tile.id}/verification`);
      if (!res.ok) throw new Error(`Failed to get challenge (${res.status})`);
      const data = await res.json();
      setChallenge(data.github?.challenge || data.challenge);
      setStep('show-challenge');
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  }

  async function handleSubmit() {
    if (!gistId.trim() || !githubUsername.trim()) {
      setErrMsg('Please enter both your GitHub username and the Gist ID.');
      return;
    }
    setStep('submitting');
    setErrMsg('');
    try {
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });

      const res = await fetch(`/api/tiles/${tile.id}/verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ type: 'github', gistId: gistId.trim(), githubUsername: githubUsername.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Verification failed (${res.status})`);
      }
      setStep('done');
      if (onVerified) onVerified();
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  }

  if (step === 'idle') {
    return (
      <button
        onClick={handleStart}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #22c55e44',
          background: '#111122', color: '#22c55e', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <span>🐙</span> Verify GitHub Identity
      </button>
    );
  }

  if (step === 'fetching-challenge') {
    return <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Fetching challenge…</div>;
  }

  if (step === 'show-challenge' || step === 'error' || step === 'submitting') {
    return (
      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 2 }}>GitHub Verification</div>
        <div>1. Create a <a href="https://gist.github.com" target="_blank" rel="noopener" style={{ color: '#3b82f6' }}>public GitHub Gist</a> with this exact text:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <code style={{
            flex: 1, display: 'block', background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
            padding: '6px 8px', fontSize: 11, wordBreak: 'break-all', color: '#a3e635',
          }}>{challenge}</code>
          <CopyButton text={challenge} />
        </div>
        <div>2. Enter your GitHub username and the Gist ID (from the URL):</div>
        <input
          placeholder="GitHub username"
          value={githubUsername}
          onChange={e => setGithubUsername(e.target.value)}
          style={{
            background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
            padding: '6px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none',
          }}
        />
        <input
          placeholder="Gist ID (e.g. abc123def456...)"
          value={gistId}
          onChange={e => setGistId(e.target.value)}
          style={{
            background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
            padding: '6px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none',
          }}
        />
        {errMsg && <div style={{ color: '#f87171', fontSize: 11 }}>{errMsg}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setStep('idle'); setErrMsg(''); setGistId(''); setGithubUsername(''); }}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #334155',
              background: '#111122', color: '#94a3b8',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            ← Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={step === 'submitting'}
            style={{
              flex: 2, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: step === 'submitting' ? '#334155' : '#22c55e', color: '#000',
              fontSize: 13, fontWeight: 600, cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
            }}
          >
            {step === 'submitting' ? 'Verifying…' : 'Submit Verification'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div style={{ fontSize: 12, color: '#22c55e', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        🐙 GitHub verified as @{githubUsername}
      </div>
    );
  }

  return null;
}

/**
 * VerifyXButton — lets the tile owner verify their X/Twitter identity via a public tweet.
 * 1. Owner clicks → fetches X challenge string from GET /api/tiles/:id/verification
 * 2. Owner tweets the challenge string publicly
 * 3. Owner pastes tweet URL + their handle
 * 4. POST /api/tiles/:id/verification with EIP-191 wallet auth → server checks tweet
 */
function VerifyXButton({ tile, address, onVerified }) {
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState('idle'); // idle | fetching-challenge | show-challenge | submitting | error | done
  const [challenge, setChallenge] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [xHandle, setXHandle] = useState(tile.xHandleVerified || '');
  const [errMsg, setErrMsg] = useState('');

  async function handleStart() {
    setStep('fetching-challenge');
    setErrMsg('');
    try {
      const res = await fetch(`/api/tiles/${tile.id}/verification`);
      if (!res.ok) throw new Error(`Failed to get challenge (${res.status})`);
      const data = await res.json();
      setChallenge(data.x?.challenge || '');
      setStep('show-challenge');
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  }

  async function handleSubmit() {
    if (!tweetUrl.trim() || !xHandle.trim()) {
      setErrMsg('Please enter both your X handle and the tweet URL.');
      return;
    }
    setStep('submitting');
    setErrMsg('');
    try {
      const ts = Math.floor(Date.now() / 1000 / 300) * 300;
      const message = `tiles.bot:metadata:${tile.id}:${ts}`;
      const sig = await signMessageAsync({ message });

      const res = await fetch(`/api/tiles/${tile.id}/verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Address': address,
          'X-Wallet-Signature': sig,
          'X-Wallet-Message': message,
        },
        body: JSON.stringify({ type: 'x', tweetUrl: tweetUrl.trim(), xHandle: xHandle.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Verification failed (${res.status})`);
      }
      setStep('done');
      if (onVerified) onVerified();
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  }

  const tweetIntentUrl = challenge
    ? `https://x.com/intent/tweet?text=${encodeURIComponent(challenge)}`
    : null;

  if (step === 'idle') {
    return (
      <button
        onClick={handleStart}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #22c55e44',
          background: '#111122', color: VERIFIED_COLOR, fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <span style={X_ICON_STYLE}>𝕏</span> Verify X/Twitter Identity
      </button>
    );
  }

  if (step === 'fetching-challenge') {
    return <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Fetching challenge…</div>;
  }

  if (step === 'show-challenge' || step === 'error' || step === 'submitting') {
    return (
      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 2 }}><span style={X_ICON_STYLE}>𝕏</span> Verification</div>
        {challenge && (
          <>
            <div>1. Post a <strong style={{ color: '#e2e8f0' }}>public tweet</strong> with this exact text:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <code style={{
                flex: 1, display: 'block', background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
                padding: '6px 8px', fontSize: 11, wordBreak: 'break-all', color: VERIFIED_COLOR,
              }}>{challenge}</code>
              <CopyButton text={challenge} />
            </div>
          </>
        )}
        {tweetIntentUrl && (
          <a
            href={tweetIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8, border: '1px solid #22c55e44',
              background: '#0d0d1a', color: VERIFIED_COLOR, fontSize: 12, textDecoration: 'none', fontWeight: 500,
            }}
          >
            <span style={X_ICON_STYLE}>𝕏</span> Open tweet composer →
          </a>
        )}
        <div>{challenge ? '2. Paste your X handle and the tweet URL:' : 'Enter your X handle and the tweet URL:'}</div>
        <input
          placeholder="X handle (e.g. @yourhandle)"
          value={xHandle}
          onChange={e => setXHandle(e.target.value)}
          style={{
            background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
            padding: '6px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none',
          }}
        />
        <input
          placeholder="Tweet URL (e.g. https://x.com/handle/status/123...)"
          value={tweetUrl}
          onChange={e => setTweetUrl(e.target.value)}
          style={{
            background: '#0d0d1a', border: '1px solid #334155', borderRadius: 6,
            padding: '6px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none',
          }}
        />
        {errMsg && <div style={{ color: '#f87171', fontSize: 11 }}>{errMsg}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setStep('idle'); setErrMsg(''); setTweetUrl(''); setXHandle(tile.xHandleVerified || ''); }}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #334155',
              background: '#111122', color: '#94a3b8',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            ← Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={step === 'submitting'}
            style={{
              flex: 2, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: step === 'submitting' ? '#334155' : VERIFIED_COLOR, color: '#000',
              fontSize: 13, fontWeight: 600, cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
            }}
          >
            {step === 'submitting' ? 'Verifying…' : 'Submit Verification'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div style={{ fontSize: 12, color: VERIFIED_COLOR, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={X_ICON_STYLE}>𝕏</span> Verified as @{xHandle.replace('@', '')}
      </div>
    );
  }

  return null;
}

export default function TilePanel({ tile, onClose, onTileUpdated }) {
  const isClaimed = !!tile.name;
  const row = Math.floor(tile.id / 256);
  const col = tile.id % 256;

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [formData, setFormData] = useState({
    name: tile.name || '',
    description: tile.description || '',
    category: tile.category || 'other',
    url: tile.url || '',
    xHandle: tile.xHandle || '',
    avatar: tile.avatar || '🤖',
    color: tile.color || '#3b82f6',
  });

  // Check if connected wallet owns this tile
  const isOwner = !!address && !!tile.owner &&
    address.toLowerCase() === tile.owner.toLowerCase();

  function handleEditStart() {
    // Refresh form with latest tile data
    setFormData({
      name: tile.name || '',
      description: tile.description || '',
      category: tile.category || 'other',
      url: tile.url || '',
      xHandle: tile.xHandle || '',
      avatar: tile.avatar || '🤖',
      color: tile.color || '#3b82f6',
    });
    setSaveMsg('');
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setSaveMsg('');
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
    color: '#666',
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
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#555' }}>
          Tile #{tile.id} · ({col}, {row})
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isClaimed && isOwner && !editing && (
            <button
              onClick={handleEditStart}
              style={{
                background: '#1a1a2e',
                border: '1px solid #2a2a3e',
                borderRadius: 6,
                color: '#94a3b8',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >✏️ Edit</button>
          )}
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer',
            lineHeight: 1,
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
              <label style={labelStyle}>Description <span style={{ color: '#444', textTransform: 'none' }}>({formData.description.length}/200)</span></label>
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
                style={{
                  flex: 1,
                  background: saving ? '#333' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none', borderRadius: 8,
                  color: '#fff', fontWeight: 600, fontSize: 13,
                  padding: '10px 0', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Signing...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                style={{
                  flex: 1,
                  background: '#1a1a2e',
                  border: '1px solid #2a2a3e',
                  borderRadius: 8, color: '#94a3b8',
                  fontWeight: 600, fontSize: 13,
                  padding: '10px 0', cursor: 'pointer',
                }}
              >Cancel</button>
            </div>

            <p style={{ fontSize: 11, color: '#444', textAlign: 'center', margin: 0 }}>
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
                    width: 256, height: 256, borderRadius: 16,
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
                marginTop: 8, fontSize: 12, color: '#888',
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
              <p style={{ margin: 0, fontSize: 14, color: '#aaa', lineHeight: 1.6 }}>
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
            <div style={{ fontSize: 11, color: '#555', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Owner address — links to basescan + OpenSea profile */}
              {tile.owner && tile.owner !== 'demo-seed-wallet' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#444' }}>Owner:</span>
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
                    style={{ color: '#6b7280', textDecoration: 'none', fontSize: 10 }}
                  >
                    OS
                  </a>
                </div>
              ) : (
                <span style={{ color: '#444' }}>Owner: demo</span>
              )}

              {/* Claim tx hash */}
              {tile.txHash ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#444' }}>Tx:</span>
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
                  <span style={{ color: '#444' }}>Tx:</span>
                  <span style={{ color: '#333' }}>—</span>
                </div>
              )}
            </div>

            {/* Edit prompt for owner */}
            {isOwner && (
              <div style={{ fontSize: 11, color: '#555', textAlign: 'center' }}>
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

            {/* OpenSea + List for Sale buttons */}
            {CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${tile.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: '#111122', border: '1px solid #2563eb44', borderRadius: 8,
                    padding: '10px 12px', fontSize: 13, color: '#3b82f6',
                    textDecoration: 'none', fontWeight: 500,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 90 90" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M45 0C20.151 0 0 20.151 0 45C0 69.849 20.151 90 45 90C69.849 90 90 69.849 90 45C90 20.151 69.849 0 45 0ZM22.203 46.512L22.392 46.206L34.101 27.891C34.272 27.63 34.677 27.657 34.803 27.945C36.756 32.328 38.448 37.782 37.656 41.175C37.323 42.57 36.396 44.46 35.352 46.206C35.217 46.458 35.073 46.71 34.911 46.953C34.839 47.061 34.722 47.124 34.596 47.124H22.536C22.221 47.124 22.032 46.773 22.203 46.512ZM74.376 52.812C74.376 52.983 74.277 53.127 74.133 53.19C73.224 53.577 70.119 55.008 68.832 56.799C65.538 61.38 63.027 67.932 57.402 67.932H33.948C25.632 67.932 18.9 61.173 18.9 52.83V52.56C18.9 52.317 19.098 52.11 19.350 52.11H32.373C32.661 52.11 32.868 52.386 32.841 52.677C32.751 53.460 32.895 54.261 33.273 54.981C33.993 56.430 35.469 57.285 37.044 57.285H43.866V52.695H37.116C36.798 52.695 36.600 52.326 36.780 52.065C36.843 51.966 36.906 51.867 36.978 51.759C37.467 51.021 38.175 49.869 38.880 48.546C39.357 47.655 39.825 46.698 40.185 45.738C40.257 45.549 40.320 45.351 40.383 45.162C40.491 44.82 40.590 44.496 40.662 44.172C40.734 43.884 40.806 43.578 40.851 43.290C40.986 42.480 41.040 41.625 41.040 40.734C41.040 40.392 41.022 40.032 40.986 39.699C40.968 39.330 40.914 38.961 40.860 38.592C40.824 38.277 40.770 37.971 40.707 37.648C40.626 37.170 40.518 36.693 40.401 36.225L40.356 36.045C40.266 35.712 40.185 35.397 40.086 35.064C39.801 34.092 39.462 33.138 39.105 32.238C38.970 31.878 38.820 31.536 38.670 31.194C38.448 30.672 38.217 30.204 38.007 29.763C37.899 29.556 37.801 29.367 37.710 29.169C37.611 28.953 37.503 28.737 37.395 28.530C37.323 28.386 37.251 28.260 37.188 28.125L35.631 25.164C35.451 24.813 35.784 24.408 36.162 24.534L45.864 27.573H45.891C45.900 27.573 45.900 27.573 45.909 27.573L47.115 27.954L48.438 28.386L48.933 28.548V23.112C48.933 22.419 49.491 21.861 50.184 21.861C50.526 21.861 50.832 21.996 51.057 22.221C51.282 22.446 51.426 22.752 51.426 23.112V29.394L52.443 29.700C52.524 29.736 52.605 29.781 52.677 29.835C52.920 30.006 53.262 30.276 53.685 30.591C54.018 30.843 54.378 31.149 54.774 31.455C55.575 32.094 56.520 32.922 57.384 33.840C57.618 34.083 57.843 34.326 58.077 34.587C58.302 34.848 58.554 35.118 58.761 35.379C59.022 35.712 59.310 36.054 59.553 36.405C59.670 36.576 59.805 36.756 59.913 36.927C60.264 37.449 60.570 37.980 60.867 38.520C60.984 38.754 61.110 39.006 61.218 39.249C61.542 39.978 61.803 40.725 61.965 41.472C62.010 41.634 62.046 41.805 62.055 41.967V42.003C62.082 42.219 62.091 42.435 62.091 42.660C62.091 43.389 61.947 44.118 61.668 44.766C61.389 45.423 60.975 46.035 60.453 46.530C59.904 47.061 59.238 47.475 58.473 47.754C58.203 47.862 57.924 47.952 57.636 48.015C57.348 48.087 57.042 48.132 56.736 48.141H54.936C54.855 48.141 54.783 48.150 54.711 48.168C54.639 48.186 54.567 48.222 54.513 48.258C54.459 48.294 54.405 48.348 54.369 48.411C54.324 48.474 54.297 48.546 54.279 48.618V52.713H60.786C61.335 52.713 61.858 52.893 62.272 53.235C62.416 53.352 63.081 53.937 63.864 54.801C63.999 54.951 64.143 55.101 64.278 55.260C65.034 56.142 65.862 57.222 66.321 58.248C66.555 58.812 66.636 59.298 66.636 59.805C66.636 60.042 66.609 60.279 66.564 60.507C66.501 60.753 66.456 60.975 66.366 61.245C66.177 61.731 65.934 62.226 65.637 62.676C65.538 62.847 65.421 63.018 65.295 63.180C65.178 63.351 65.052 63.513 64.953 63.666C64.827 63.864 64.701 64.053 64.611 64.278C64.512 64.494 64.449 64.728 64.449 64.953H74.376V52.812ZM51.426 35.271V48.141H55.011C55.479 48.141 55.947 48.006 56.352 47.736C56.745 47.466 57.069 47.088 57.294 46.638C57.519 46.188 57.636 45.693 57.636 45.171V44.928C57.636 44.514 57.555 44.082 57.384 43.686C57.213 43.290 56.952 42.921 56.646 42.606C56.340 42.300 55.980 42.039 55.593 41.841C55.206 41.652 54.792 41.544 54.369 41.535H51.426V35.271Z" />
                  </svg>
                  View on OpenSea
                </a>
                {/* List for Sale — links to OpenSea sell flow */}
                {isOwner && (
                  <a
                    href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${tile.id}/sell`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: '#111122', border: '1px solid #a855f744', borderRadius: 8,
                      padding: '10px 12px', fontSize: 13, color: '#a855f7',
                      textDecoration: 'none', fontWeight: 500,
                    }}
                  >
                    💰 List for Sale
                  </a>
                )}
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#555' }}>Unclaimed</h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#444' }}>
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

          <p style={{ fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 1.6 }}>
            Pay with USDC on Base via x402.<br />
            No signup required. Just a wallet.
          </p>
        </>
      )}
    </div>
  );
}
