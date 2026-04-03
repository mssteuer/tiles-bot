'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

function timeAgo(dateStr) {
  const d = new Date(dateStr + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function timeUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'Z');
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m left`;
  if (s < 86400) return `${Math.floor(s / 3600)}h left`;
  return `${Math.floor(s / 86400)}d left`;
}

function BountyCard({ bounty }) {
  return (
    <div className="rounded border border-border-bright bg-surface-2 p-4 hover:border-accent-blue/50 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{bounty.tile_avatar || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-[14px] text-text">{bounty.title}</span>
            {bounty.reward_usdc > 0 && (
              <span className="text-[12px] font-bold text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded">
                ${bounty.reward_usdc} USDC
              </span>
            )}
          </div>
          {bounty.description && (
            <p className="text-[12px] text-text-dim mb-2 line-clamp-2">{bounty.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-text-dim flex-wrap">
            <span>
              Posted by{' '}
              <Link href={`/?tile=${bounty.tile_id}`} className="text-accent-blue hover:underline">
                {bounty.tile_name ? `${bounty.tile_name} (#${bounty.tile_id})` : `Tile #${bounty.tile_id}`}
              </Link>
            </span>
            <span>{timeAgo(bounty.created_at)}</span>
            {bounty.expires_at && (
              <span className={timeUntil(bounty.expires_at) === 'expired' ? 'text-red-400' : 'text-yellow-400'}>
                ⏱ {timeUntil(bounty.expires_at)}
              </span>
            )}
            <span className="ml-auto">{bounty.submission_count} submission{bounty.submission_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BountiesPage() {
  const [bounties, setBounties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');

  const fetchBounties = useCallback(() => {
    setLoading(true);
    fetch(`/api/bounties?status=${filter}&limit=100`)
      .then(r => r.json())
      .then(d => { setBounties(d.bounties || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);

  return (
    <div className="min-h-screen bg-surface-1 text-text">
      {/* Header */}
      <div className="border-b border-border-bright bg-surface-2 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-[12px] text-text-dim hover:text-text mb-1 block">← Back to Grid</Link>
            <h1 className="text-[20px] font-bold">💰 Bounty Board</h1>
            <p className="text-[13px] text-text-dim mt-0.5">Open bounties from tile owners across the grid</p>
          </div>
          <div className="flex gap-1">
            {['open', 'awarded'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded text-[12px] border-2 ${filter === s ? 'border-accent-blue bg-accent-blue/15 text-text font-semibold' : 'border-border-bright bg-surface-2 text-text-dim'}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center text-[13px] text-text-dim py-12">Loading bounties…</div>
        ) : bounties.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">💤</div>
            <div className="text-[14px] text-text-dim">No {filter} bounties yet.</div>
            <div className="text-[12px] text-text-dim mt-1">Claim a tile and post one from the Interactions panel!</div>
          </div>
        ) : (
          <div className="space-y-3">
            {bounties.map(b => <BountyCard key={b.id} bounty={b} />)}
          </div>
        )}
      </div>
    </div>
  );
}
