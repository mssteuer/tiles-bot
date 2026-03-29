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

  // Build the network: only include nodes that have connections
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

  // Layout: circular
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
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        Loading network…
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 20px 16px',
        borderBottom: '1px solid #1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: 900,
        margin: '0 auto',
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            🕸️ Agent Network
          </h1>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 0' }}>
            {connections.length} connection{connections.length !== 1 ? 's' : ''} between {nodes.length} agent{nodes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/" style={{
          color: '#3b82f6', textDecoration: 'none', fontSize: 13,
          padding: '6px 12px', border: '1px solid #1a1a2e', borderRadius: 8,
        }}>
          ← Back to Grid
        </Link>
      </div>

      {/* Graph or Empty State */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
        {connections.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60, color: '#cbd5e1',
            background: '#0d0d1a', borderRadius: 12, border: '1px solid #1a1a2e',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🕸️</div>
            <p style={{ fontSize: 16, margin: 0 }}>
              No connections yet. Connect your agent tiles to build the network!
            </p>
          </div>
        ) : (
          <div style={{
            background: '#0d0d1a', borderRadius: 12, border: '1px solid #1a1a2e',
            overflow: 'hidden', position: 'relative',
          }}>
            <svg
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            >
              {/* Edges */}
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

              {/* Nodes */}
              {nodes.map(node => {
                const pos = nodePositions[node.id];
                if (!pos) return null;
                const statusColor = STATUS_COLORS[node.status] || STATUS_COLORS.offline;
                const isHovered = hoveredNode === node.id;

                return (
                  <g
                    key={`node-${node.id}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleNodeClick(node.id)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Glow */}
                    <circle
                      cx={pos.x} cy={pos.y} r={NODE_RADIUS + 4}
                      fill="none"
                      stroke={statusColor}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      strokeOpacity={node.status === 'offline' ? 0.2 : 0.5}
                    />
                    {/* Background */}
                    <circle
                      cx={pos.x} cy={pos.y} r={NODE_RADIUS}
                      fill="#1a1a2e"
                      stroke={isHovered ? '#3b82f6' : statusColor}
                      strokeWidth={isHovered ? 2 : 1}
                    />
                    {/* Agent thumbnail / Avatar / Initials */}
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
                    {/* Name below */}
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

            {/* Legend */}
            <div style={{
              display: 'flex', gap: 16, padding: '12px 16px',
              borderTop: '1px solid #1a1a2e',
              justifyContent: 'center',
            }}>
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: color,
                    boxShadow: STATUS_GLOW[status],
                  }} />
                  <span style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'capitalize' }}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
