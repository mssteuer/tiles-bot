'use client';

import React from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🌐' },
  { id: 'coding', label: 'Coding', emoji: '💻' },
  { id: 'trading', label: 'Trading', emoji: '📈' },
  { id: 'research', label: 'Research', emoji: '🔬' },
  { id: 'social', label: 'Social', emoji: '💬' },
  { id: 'infrastructure', label: 'Infrastructure', emoji: '🔧' },
  { id: 'other', label: 'Other', emoji: '✨' },
  { id: 'uncategorized', label: 'Uncategorized', emoji: '❓' },
];

function AvatarIcon({ tile }) {
  if (tile.imageUrl) {
    return <img src={tile.imageUrl} alt={tile.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />;
  }
  const emoji = tile.avatar || '🤖';
  return <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#2a2a3e] bg-surface-2 text-[24px]">{emoji}</div>;
}

function AgentCard({ agent, view }) {
  const href = `/?tile=${agent.id}`;
  const catEmoji = CATEGORIES.find(c => c.id === agent.category)?.emoji || '✨';
  const isOnline = agent.status === 'online';

  if (view === 'list') {
    return (
      <Link href={href} className="no-underline">
        <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#2a2a3e] bg-surface-alt px-3.5 py-2.5 transition-colors hover:border-indigo-500">
          <AvatarIcon tile={agent} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-text">{agent.name}</span>
              {isOnline && <span className="inline-block h-2 w-2 rounded-full bg-accent-green" title="Online" />}
              <span className="text-[12px] text-text-dim">{catEmoji} {agent.category}</span>
            </div>
            {agent.description && (
              <p className="mt-0.5 overflow-hidden truncate whitespace-nowrap text-[12px] text-text-light">{agent.description}</p>
            )}
          </div>
          <div className="shrink-0 text-[11px] text-text-dim">#{agent.id}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="no-underline">
      <div className="flex h-full cursor-pointer flex-col gap-2.5 rounded-[10px] border border-[#2a2a3e] bg-surface-alt p-3.5 transition-transform transition-colors hover:-translate-y-px hover:border-indigo-500">
        <div className="flex items-start gap-2.5">
          <AvatarIcon tile={agent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14px] font-semibold text-text">{agent.name}</span>
              {isOnline && <span className="inline-block h-2 w-2 rounded-full bg-accent-green" title="Online" />}
            </div>
            <div className="mt-0.5 text-[11px] text-text-dim">{catEmoji} {agent.category} · #{agent.id}</div>
          </div>
        </div>
        {agent.description && (
          <p className="m-0 overflow-hidden text-[12px] leading-[1.5] text-text-light [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{agent.description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {agent.url && (
            <a href={agent.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-indigo-500 no-underline">🌐 Website</a>
          )}
          {agent.xHandle && (
            <a href={`https://x.com/${agent.xHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-indigo-500 no-underline">𝕏 {agent.xHandle}</a>
          )}
          {agent.githubVerified && <span className="text-[11px] text-accent-green">✓ GitHub</span>}
        </div>
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [categoryCounts, setCategoryCounts] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [view, setView] = React.useState('grid');
  const [showMyAgents, setShowMyAgents] = React.useState(false);
  const { address, isConnected } = useAccount();

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        setAgents(d.agents || []);
        setTotal(d.total || 0);
        setCategoryCounts(d.categoryCounts || {});
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const filtered = React.useMemo(() => {
    let result = agents;
    if (showMyAgents && address) result = result.filter(a => a.owner?.toLowerCase() === address.toLowerCase());
    if (category !== 'all') result = result.filter(a => (a.category || 'uncategorized') === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.xHandle && a.xHandle.toLowerCase().includes(q))
      );
    }
    return result;
  }, [agents, category, search, showMyAgents, address]);

  return (
    <div className="min-h-screen bg-surface-dark font-body text-text">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border-dim bg-linear-to-b from-surface-alt to-surface-dark px-6 py-3.5">
        <Link href="/" className="text-[14px] text-text-dim no-underline">← Grid</Link>
        <span className="text-text-dim">|</span>
        <span className="text-[18px] font-bold">🤖 Agents</span>
        <span className="text-[13px] text-text-dim">{total} claimed</span>
      </header>

      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <div className="mb-4 flex flex-wrap gap-2.5">
          <input
            type="text"
            placeholder="Search agents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-[#2a2a3e] bg-surface-alt px-3 py-2 text-[14px] text-text outline-hidden"
          />
          {isConnected && (
            <button
              onClick={() => setShowMyAgents(!showMyAgents)}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-semibold ${showMyAgents ? 'border border-accent-blue bg-[rgba(59,130,246,0.15)] text-accent-blue' : 'border border-[#2a2a3e] bg-surface-alt text-text-dim'}`}
            >
              👤 My Agents
            </button>
          )}
          <div className="flex gap-1">
            {['grid', 'list'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`cursor-pointer rounded-lg border border-[#2a2a3e] px-3.5 py-2 text-[13px] font-medium ${view === v ? 'bg-indigo-500 text-white' : 'bg-surface-alt text-text-dim'}`}
              >
                {v === 'grid' ? '⊞ Grid' : '☰ List'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const count = cat.id === 'all' ? total : (categoryCounts[cat.id] || 0);
            if (count === 0 && cat.id !== 'all') return null;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`cursor-pointer rounded-full border px-3 py-1.25 text-[12px] font-medium ${category === cat.id ? 'border-indigo-500 bg-[rgba(99,102,241,0.15)] text-indigo-400' : 'border-[#2a2a3e] bg-surface-alt text-text-light'}`}
              >
                {cat.emoji} {cat.label} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>

        {loading && <div className="px-4 py-15 text-center text-text-light">Loading agents…</div>}
        {error && <div className="px-5 py-5 text-accent-red">Error: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="px-4 py-15 text-center text-text-light">{search ? `No agents found matching "${search}"` : 'No agents in this category yet.'}</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className={view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3' : 'flex flex-col gap-2'}>
            {filtered.map(agent => <AgentCard key={agent.id} agent={agent} view={view} />)}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="mt-6 text-center text-[13px] text-text-dim">
            Showing {filtered.length} of {total} agents
            {search && ` matching "${search}"`}
            {category !== 'all' && ` in ${category}`}
          </div>
        )}
      </div>
    </div>
  );
}
