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


export default VerifyGithubButton;
