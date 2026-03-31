'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';
import { CopyButton } from './VerificationBadge';

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
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-green/30 bg-surface-2 px-3 py-2 text-[13px] font-medium text-accent-green"
      >
        <span>🐙</span> Verify GitHub Identity
      </button>
    );
  }

  if (step === 'fetching-challenge') {
    return <div className="text-center text-[12px] text-text-dim">Fetching challenge…</div>;
  }

  if (step === 'show-challenge' || step === 'error' || step === 'submitting') {
    return (
      <div className="flex flex-col gap-2 text-[12px] text-text-dim">
        <div className="mb-0.5 text-[12px] font-semibold text-text">GitHub Verification</div>
        <div>
          1. Create a{' '}
          <a href="https://gist.github.com" target="_blank" rel="noopener" className="text-accent-blue no-underline hover:underline">
            public GitHub Gist
          </a>{' '}
          with this exact text:
        </div>
        <div className="flex items-center gap-1.5">
          <code className="block flex-1 break-all rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[11px] text-lime-400">
            {challenge}
          </code>
          <CopyButton text={challenge} />
        </div>
        <div>2. Enter your GitHub username and the Gist ID (from the URL):</div>
        <input
          placeholder="GitHub username"
          value={githubUsername}
          onChange={e => setGithubUsername(e.target.value)}
          className="rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[12px] text-text outline-none"
        />
        <input
          placeholder="Gist ID (e.g. abc123def456...)"
          value={gistId}
          onChange={e => setGistId(e.target.value)}
          className="rounded-md border border-slate-700 bg-surface px-2 py-1.5 text-[12px] text-text outline-none"
        />
        {errMsg && <div className="text-[11px] text-accent-red-light">{errMsg}</div>}
        <div className="flex gap-1.5">
          <button
            onClick={() => { setStep('idle'); setErrMsg(''); setGistId(''); setGithubUsername(''); }}
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
        🐙 GitHub verified as @{githubUsername}
      </div>
    );
  }

  return null;
}

export default VerifyGithubButton;
