'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUS_COLORS = {
  online: '#22c55e',
  busy: '#eab308',
  offline: '#475569',
};

const STATUS_GLOW = {
  online: '0 0 12px rgba(34,197,94,0.5)',
  busy: '0 0 12px rgba(234,179,8,0.4)',
  offline: 'none',
};

function getInitials(name) {
  if (!name) return '?';
  const words = name.replace(/^Tile #/, '').trim();
  if (/^\d+$/.test(words)) return `#${words.slice(0, 3)}`;
  return words.slice(0, 2).toUpperCase();
}

export default function NetworkPage() {
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/connections').then(r => r.json()),
      fetch('/api/agents?limit=500').then(r => r.json()),
    ]).then(([connData, agentData]) => {
      setConnections(connData.connections || []);
      setAgents(agentData.agents || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const connectedNodeIds = new Set();
  connections.forEach(c => {
    connectedNodeIds.add(c.fromId);
    connectedNodeIds.add(c.toId);
  });

  const agentMap = {};
  agents.forEach(a => { agentMap[a.id] = a; });

  const nodes = Array.from(connectedNodeIds).map(id => {
    const agent = agentMap[id];
    return {
      id,
      name: agent?.name || `Tile #${id}`,
      avatar: agent?.avatar || null,
      imageUrl: agent?.imageUrl || null,
      status: agent?.status || 'offline',
      category: agent?.category || 'uncategorized',
    };
  });

  const SVG_SIZE = 700;
  const CENTER = SVG_SIZE / 2;
  const n = nodes.length;
  const RADIUS = Math.min(280, Math.max(100, n * 12));
  const NODE_RADIUS = n > 30 ? 18 : 24;

  const nodePositions = {};
  nodes.forEach((node, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    nodePositions[node.id] = {
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });

  const handleNodeClick = useCallback((id) => {
    router.push(`/?tile=${id}`);
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] font-sans text-text">
        Loading network…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] font-sans text-text">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border-dim bg-linear-to-b from-surface-alt to-[#0a0a0f] px-6 py-3.5">
        <Link href="/" className="text-[14px] text-text-dim no-underline">← Grid</Link>
        <span className="text-text-dim">|</span>
        <span className="text-[18px] font-bold">🕸️ Network</span>
      </div>

      <div className="mx-auto max-w-[900px] px-5 py-5">
        {connections.length === 0 ? (
          <div className="rounded-xl border border-border-dim bg-[#0d0d1a] px-6 py-15 text-center text-text-light">
            <div className="mb-4 text-[48px]">🕸️</div>
            <p className="m-0 text-[16px]">No connections yet. Connect your agent tiles to build the network!</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-border-dim bg-[#0d0d1a]">
            <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} className="block h-auto w-full">
              {connections.map((c, i) => {
                const from = nodePositions[c.fromId];
                const to = nodePositions[c.toId];
                if (!from || !to) return null;
                const isHighlighted = hoveredNode === c.fromId || hoveredNode === c.toId;
                return (
                  <line
                    key={`edge-${i}`}
                    x1={from.x} y1={from.y}
                    x2={to.x} y2={to.y}
                    stroke={isHighlighted ? '#3b82f6' : '#1e293b'}
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeOpacity={isHighlighted ? 0.9 : 0.4}
                  />
                );
              })}

              {nodes.map(node => {
                const pos = nodePositions[node.id];
                if (!pos) return null;
                const statusColor = STATUS_COLORS[node.status] || STATUS_COLORS.offline;
                const isHovered = hoveredNode === node.id;

                return (
                  <g
                    key={`node-${node.id}`}
                    className="cursor-pointer"
                    onClick={() => handleNodeClick(node.id)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <circle
                      cx={pos.x} cy={pos.y} r={NODE_RADIUS + 4}
                      fill="none"
                      stroke={statusColor}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeOpacity={node.status === 'offline' ? 0.2 : 0.5}
                    />
                    <circle
                      cx={pos.x} cy={pos.y} r={NODE_RADIUS}
                      fill="#1a1a2e"
                      stroke={isHovered ? '#3b82f6' : statusColor}
                      strokeWidth={isHovered ? 2 : 1}
                    />
                    {node.imageUrl ? (
                      <>
                        <defs>
                          <clipPath id={`clip-${node.id}`}>
                            <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS - 1} />
                          </clipPath>
                        </defs>
                        <image
                          href={node.imageUrl}
                          x={pos.x - NODE_RADIUS + 1} y={pos.y - NODE_RADIUS + 1}
                          width={(NODE_RADIUS - 1) * 2} height={(NODE_RADIUS - 1) * 2}
                          clipPath={`url(#clip-${node.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </>
                    ) : (
                      <text
                        x={pos.x} y={pos.y}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={node.avatar ? 16 : 10}
                        fill={node.avatar ? undefined : '#94a3b8'}
                        fontWeight={node.avatar ? undefined : 600}
                      >
                        {node.avatar || getInitials(node.name)}
                      </text>
                    )}
                    <text
                      x={pos.x} y={pos.y + NODE_RADIUS + 14}
                      textAnchor="middle"
                      fontSize={9}
                      fill={isHovered ? '#e2e8f0' : '#64748b'}
                    >
                      {node.name.length > 14 ? node.name.slice(0, 12) + '…' : node.name}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="flex justify-center gap-4 border-t border-border-dim px-4 py-3">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className="status-dot" style={{ '--dot-color': color, '--dot-glow': STATUS_GLOW[status] }} />
                  <span className="text-[11px] capitalize text-text-light">{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
