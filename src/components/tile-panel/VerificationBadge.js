'use client';

import { useState } from 'react';

const VERIFIED_COLOR = '#22c55e';
const UNVERIFIED_COLOR = '#6b7280';

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


export { VerificationBadge, CopyButton };
