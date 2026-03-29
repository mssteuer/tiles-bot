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

function truncateAddr(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AvatarIcon({ tile }) {
  if (tile.imageUrl) {
    return (
      <img
        src={tile.imageUrl}
        alt={tile.name}
        style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const emoji = tile.avatar || '🤖';
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 8, background: '#1a1a2e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24, flexShrink: 0, border: '1px solid #2a2a3e',
    }}>
      {emoji}
    </div>
  );
}

function AgentCard({ agent, view }) {
  const href = `/?tile=${agent.id}`;
  const catEmoji = CATEGORIES.find(c => c.id === agent.category)?.emoji || '✨';
  const isOnline = agent.status === 'online';

  if (view === 'list') {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 8,
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a3e'}
        >
          <AvatarIcon tile={agent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{agent.name}</span>
              {isOnline && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} title="Online" />
              )}
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{catEmoji} {agent.category}</span>
            </div>
            {agent.description && (
              <p style={{ color: '#cbd5e1', fontSize: 12, margin: 0, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.description}
              </p>
            )}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0 }}>
            #{agent.id}
          </div>
        </div>
      </Link>
    );
  }

  // Grid card
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 10,
        padding: 14, cursor: 'pointer', height: '100%', boxSizing: 'border-box',
        transition: 'border-color 0.15s, transform 0.1s',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.transform = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AvatarIcon tile={agent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{agent.name}</span>
              {isOnline && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} title="Online" />
              )}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
              {catEmoji} {agent.category} · #{agent.id}
            </div>
          </div>
        </div>
        {agent.description && (
          <p style={{
            color: '#cbd5e1', fontSize: 12, margin: 0, lineHeight: '1.5',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {agent.description}
          </p>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {agent.url && (
            <a href={agent.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>
              🌐 Website
            </a>
          )}
          {agent.xHandle && (
            <a href={`https://x.com/${agent.xHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#6366f1', fontSize: 11, textDecoration: 'none' }}>
              𝕏 {agent.xHandle}
            </a>
          )}
          {agent.githubVerified && (
            <span style={{ color: '#22c55e', fontSize: 11 }}>✓ GitHub</span>
          )}
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
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Client-side filter
  const filtered = React.useMemo(() => {
    let result = agents;
    if (showMyAgents && address) {
      result = result.filter(a => a.owner?.toLowerCase() === address.toLowerCase());
    }
    if (category !== 'all') {
      result = result.filter(a => (a.category || 'uncategorized') === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.xHandle && a.xHandle.toLowerCase().includes(q))
      );
    }
    return result;
  }, [agents, category, search]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '14px 24px', borderBottom: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14 }}>← Grid</Link>
        <span style={{ color: '#94a3b8' }}>|</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>🤖 Agents</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{total} claimed</span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

      {/* Search + View Toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search agents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
            background: '#0f0f1a', border: '1px solid #2a2a3e', color: '#e2e8f0',
            fontSize: 14, outline: 'none',
          }}
        />
        {isConnected && (
          <button onClick={() => setShowMyAgents(!showMyAgents)} style={{
            padding: '8px 16px', borderRadius: 8,
            border: showMyAgents ? '1px solid #3b82f6' : '1px solid #2a2a3e',
            background: showMyAgents ? 'rgba(59,130,246,0.15)' : '#0f0f1a',
            color: showMyAgents ? '#3b82f6' : '#94a3b8',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            👤 My Agents
          </button>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {['grid', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #2a2a3e',
              background: view === v ? '#6366f1' : '#0f0f1a', color: view === v ? '#fff' : '#94a3b8',
              cursor: 'pointer', fontSize: 13, fontWeight: 500,
            }}>
              {v === 'grid' ? '⊞ Grid' : '☰ List'}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all' ? total : (categoryCounts[cat.id] || 0);
          if (count === 0 && cat.id !== 'all') return null;
          return (
            <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
              padding: '5px 12px', borderRadius: 20, border: '1px solid',
              borderColor: category === cat.id ? '#6366f1' : '#2a2a3e',
              background: category === cat.id ? 'rgba(99,102,241,0.15)' : '#0f0f1a',
              color: category === cat.id ? '#818cf8' : '#cbd5e1',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              {cat.emoji} {cat.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: 'center', color: '#cbd5e1', padding: 60 }}>Loading agents…</div>
      )}
      {error && (
        <div style={{ color: '#ef4444', padding: 20 }}>Error: {error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#cbd5e1', padding: 60 }}>
          {search ? `No agents found matching "${search}"` : 'No agents in this category yet.'}
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div style={view === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        } : {
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {filtered.map(agent => (
            <AgentCard key={agent.id} agent={agent} view={view} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ marginTop: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Showing {filtered.length} of {total} agents
          {search && ` matching "${search}"`}
          {category !== 'all' && ` in ${category}`}
        </div>
      )}
      </div>
    </div>
  );
}
