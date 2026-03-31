'use client';

import { useState } from 'react';

const VERIFIED_COLOR = '#22c55e';
const UNVERIFIED_COLOR = '#6b7280';

function VerificationBadge({ verified, title }) {
  return (
    <span
      title={title}
      className={`text-[11px] font-bold ${verified ? 'text-accent-green' : 'text-gray-500'}`}
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
      className={`shrink-0 rounded-[5px] border border-slate-700 px-2 py-1 text-[11px] ${copied ? 'bg-accent-green/15 text-accent-green' : 'bg-surface-2 text-text-dim'}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

export { VerificationBadge, CopyButton };
