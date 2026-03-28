'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

function relativeTime(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateAddress(addr) {
  if (!addr) return '???';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function eventIcon(type) {
  switch (type) {
    case 'claimed': return '🆕';
    case 'tile_image_updated': return '🖼️';
    case 'connection_accepted': return '🔗';
    case 'metadata_updated': return '✏️';
    default: return '📡';
  }
}

function eventLabel(type) {
  switch (type) {
    case 'claimed': return 'Tile Claimed';
    case 'tile_image_updated': return 'Image Updated';
    case 'connection_accepted': return 'Connection Made';
    case 'metadata_updated': return 'Profile Updated';
    default: return 'Event';
  }
}

export default function ActivityPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Fetch initial activity
  useEffect(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // SSE real-time updates
  const prependEvent = useCallback((newEvent) => {
    setEvents(prev => {
      const next = [newEvent, ...prev];
      return next.slice(0, 100);
    });
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const now = data.timestamp || new Date().toISOString();
        if (data.type === 'tile_claimed') {
          prependEvent({
            type: 'claimed',
            tileId: data.tileId ?? data.id,
            tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`,
            tileAvatar: data.avatar || null,
            owner: data.owner,
            timestamp: now,
          });
        } else if (data.type === 'tile_image_updated') {
          prependEvent({
            type: 'tile_image_updated',
            tileId: data.tileId ?? data.id,
            tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`,
            tileAvatar: data.avatar || null,
            owner: data.owner || '',
            timestamp: now,
          });
        } else if (data.type === 'connection_accepted') {
          prependEvent({
            type: 'connection_accepted',
            tileId: data.fromTileId ?? data.tileId,
            tileName: data.tileName ?? `Tiles #${data.fromTileId} ↔ #${data.toTileId}`,
            tileAvatar: null,
            owner: '',
            timestamp: now,
          });
        } else if (data.type === 'tile_metadata_updated' || data.type === 'metadata_updated') {
          prependEvent({
            type: 'metadata_updated',
            tileId: data.tileId ?? data.id,
            tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`,
            tileAvatar: data.avatar || null,
            owner: data.owner || '',
            timestamp: now,
          });
        }
      } catch {}
    };

    return () => es.close();
  }, [prependEvent]);

  // Update relative times every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

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
        maxWidth: 800,
        margin: '0 auto',
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            📡 Activity Feed
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Live feed of what&apos;s happening on the grid
          </p>
        </div>
        <Link href="/" style={{
          color: '#3b82f6', textDecoration: 'none', fontSize: 13,
          padding: '6px 12px', border: '1px solid #1a1a2e', borderRadius: 8,
        }}>
          ← Back to Grid
        </Link>
      </div>

      {/* Event List */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            Loading activity…
          </div>
        )}

        {!loading && events.length === 0 && (
          <div style={{
            textAlign: 'center', padding: 60, color: '#64748b',
            background: '#0d0d1a', borderRadius: 12, border: '1px solid #1a1a2e',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
            <p style={{ fontSize: 16, margin: 0 }}>No activity yet — be the first to claim a tile!</p>
          </div>
        )}

        {events.map((evt, i) => (
          <Link
            key={`${evt.tileId}-${evt.timestamp}-${i}`}
            href={`/?tile=${evt.tileId}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              background: '#0d0d1a',
              border: '1px solid #1a1a2e',
              borderRadius: 10,
              marginBottom: 8,
              transition: 'border-color 0.15s ease',
              cursor: 'pointer',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a4e'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1a2e'}
            >
              {/* Icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: '#1a1a2e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {evt.tileAvatar || eventIcon(evt.type)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {evt.tileName || `Tile #${evt.tileId}`}
                  </span>
                  <span style={{
                    fontSize: 10, color: '#8b5cf6', background: '#1a1a2e',
                    padding: '2px 6px', borderRadius: 4,
                  }}>
                    #{evt.tileId}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  {eventLabel(evt.type)} • {truncateAddress(evt.owner)}
                </div>
              </div>

              {/* Timestamp */}
              <div style={{
                fontSize: 12, color: '#475569', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {relativeTime(evt.timestamp)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
