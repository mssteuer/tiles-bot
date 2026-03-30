'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';
import { CopyButton } from './VerificationBadge';
import { X_ICON_STYLE } from './utils';

const VERIFIED_COLOR = '#22c55e';

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


export default VerifyXButton;
