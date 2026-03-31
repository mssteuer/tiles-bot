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
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-green/30 bg-surface-2 px-3 py-2 text-[13px] font-medium text-accent-green"
      >
        <span style={X_ICON_STYLE}>𝕏</span> Verify X/Twitter Identity
      </button>
    );
  }

  if (step === 'fetching-challenge') {
    return <div className="text-center text-[12px] text-text-dim">Fetching challenge…</div>;
  }

  if (step === 'show-challenge' || step === 'error' || step === 'submitting') {
    return (
      <div className="flex flex-col gap-2 text-[12px] text-text-dim">
        <div className="mb-0.5 text-[12px] font-semibold text-text">
          <span style={X_ICON_STYLE}>𝕏</span> Verification
        </div>
        {challenge && (
          <>
            <div>
              1. Post a <strong className="text-text">public tweet</strong> with this exact text:
            </div>
            <div className="flex items-center gap-1.5">
              <code className="block flex-1 break-all rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[11px] text-accent-green">
                {challenge}
              </code>
              <CopyButton text={challenge} />
            </div>
          </>
        )}
        {tweetIntentUrl && (
          <a
            href={tweetIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-accent-green/30 bg-surface px-3 py-2 text-[12px] font-medium text-accent-green no-underline"
          >
            <span style={X_ICON_STYLE}>𝕏</span> Open tweet composer →
          </a>
        )}
        <div>{challenge ? '2. Paste your X handle and the tweet URL:' : 'Enter your X handle and the tweet URL:'}</div>
        <input
          placeholder="X handle (e.g. @yourhandle)"
          value={xHandle}
          onChange={e => setXHandle(e.target.value)}
          className="rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[12px] text-text outline-none"
        />
        <input
          placeholder="Tweet URL (e.g. https://x.com/handle/status/123...)"
          value={tweetUrl}
          onChange={e => setTweetUrl(e.target.value)}
          className="rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[12px] text-text outline-none"
        />
        {errMsg && <div className="text-[11px] text-accent-red-light">{errMsg}</div>}
        <div className="flex gap-1.5">
          <button
            onClick={() => { setStep('idle'); setErrMsg(''); setTweetUrl(''); setXHandle(tile.xHandleVerified || ''); }}
            className="flex-1 rounded-lg border border-slate-700 bg-surface-2 px-3 py-2 text-[12px] text-text-dim"
          >
            ← Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={step === 'submitting'}
            className={`flex-[2] rounded-lg px-3 py-2 text-[13px] font-semibold ${step === 'submitting' ? 'cursor-not-allowed bg-slate-700 text-black' : 'bg-accent-green text-black'}`}
          >
            {step === 'submitting' ? 'Verifying…' : 'Submit Verification'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex items-center justify-center gap-1 text-center text-[12px] text-accent-green">
        <span style={X_ICON_STYLE}>𝕏</span> Verified as @{xHandle.replace('@', '')}
      </div>
    );
  }

  return null;
}

export default VerifyXButton;
