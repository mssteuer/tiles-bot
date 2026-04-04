'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const ACTION_EMOJIS = {
  slap: '🐟', challenge: '⚔️', praise: '🙌', wave: '👋',
  poke: '👉', taunt: '😈', hug: '🤗', 'high-five': '🖐️',
};

const ACTION_VERBS = {
  slap: 'slapped', challenge: 'challenged', praise: 'praised', wave: 'waved at',
  poke: 'poked', taunt: 'taunted', hug: 'hugged', 'high-five': 'high-fived',
};

function eventIcon(type, meta) {
  switch (type) {
    case 'claimed': return '🆕';
    case 'tile_image_updated': return '🖼️';
    case 'connection_accepted': return '🔗';
    case 'metadata_updated': return '✏️';
    case 'note_added': return '📝';
    case 'tile_action': return ACTION_EMOJIS[meta?.actionType] || '⚡';
    case 'tile_emote': return meta?.emoji || '🎭';
    case 'tile_message': return '💌';
    case 'heartbeat': return '💓';
    case 'spotlight_purchased': return '⭐';
    default: return '📡';
  }
}

function eventDescription(type, meta, tileName) {
  const name = tileName || (meta?.tileId != null ? `Tile #${meta.tileId}` : 'An agent');
  switch (type) {
    case 'claimed': return `${name} just claimed their tile`;
    case 'tile_image_updated': return `${name} updated their image`;
    case 'connection_accepted': return `${name} made a connection`;
    case 'metadata_updated': return `${name} updated their profile`;
    case 'note_added': return `${name} received a note`;
    case 'tile_action': {
      const verb = ACTION_VERBS[meta?.actionType] || 'acted';
      const fromName = meta?.fromName || (meta?.fromTile != null ? `Tile #${meta.fromTile}` : null);
      return fromName ? `${fromName} ${verb} ${name}` : `${name} received an action`;
    }
    case 'tile_emote':
      return `${name} received ${meta?.emoji || 'an emote'}`;
    case 'tile_message': return `${name} got a message`;
    case 'heartbeat': return `${name} is online 🟢`;
    case 'spotlight_purchased': return `${name} bought a ${meta?.duration_hours || 24}h spotlight!`;
    default: return `${name} had activity`;
  }
}

// ─── SSE event normalizer (same logic as activity/page.js) ───────────────────

function normalizeSSEEvent(data) {
  const now = data.timestamp || new Date().toISOString();
  const base = { timestamp: now };

  if (data.type === 'tile_claimed') {
    return { ...base, type: 'claimed', tileId: data.tileId ?? data.id, tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`, tileAvatar: data.avatar || null, owner: data.owner };
  }
  if (data.type === 'tile_image_updated') {
    return { ...base, type: 'tile_image_updated', tileId: data.tileId ?? data.id, tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`, tileAvatar: data.avatar || null, owner: data.owner || '' };
  }
  if (data.type === 'connection_accepted') {
    return { ...base, type: 'connection_accepted', tileId: data.fromTileId ?? data.tileId, tileName: `Tiles #${data.fromTileId} ↔ #${data.toTileId}`, tileAvatar: null, owner: '' };
  }
  if (data.type === 'tile_metadata_updated' || data.type === 'metadata_updated') {
    return { ...base, type: 'metadata_updated', tileId: data.tileId ?? data.id, tileName: data.tileName ?? data.name ?? `Tile #${data.tileId ?? data.id}`, tileAvatar: data.avatar || null, owner: data.owner || '' };
  }
  if (data.type === 'note_added') {
    return { ...base, type: 'note_added', tileId: data.tileId, tileName: data.tileName ?? `Tile #${data.tileId}`, tileAvatar: null, owner: data.author || '', meta: { noteId: data.noteId, authorTile: data.authorTile } };
  }
  if (data.type === 'tile_action') {
    return { ...base, type: 'tile_action', tileId: data.toTile, tileName: data.toName ?? `Tile #${data.toTile}`, tileAvatar: null, owner: data.actor || '', meta: { fromTile: data.fromTile, fromName: data.fromName, actionType: data.actionType } };
  }
  if (data.type === 'tile_emote') {
    return { ...base, type: 'tile_emote', tileId: data.toTile, tileName: data.toName ?? `Tile #${data.toTile}`, tileAvatar: null, owner: data.actor || '', meta: { emoji: data.emoji, fromTile: data.fromTile, fromName: data.fromName } };
  }
  if (data.type === 'heartbeat') {
    return { ...base, type: 'heartbeat', tileId: data.tileId, tileName: data.tileName ?? `Tile #${data.tileId}`, tileAvatar: data.tileAvatar || null, owner: data.wallet || '' };
  }
  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

const MAX_EVENTS = 15;
const POLL_INTERVAL_MS = 30_000;

/**
 * ActivityFeed — compact live activity strip for the homepage.
 *
 * Props:
 *   onTileClick(tileId) — called when user clicks an event (navigate to tile)
 *   collapsed          — if true, render as collapsed icon-only strip
 *   onToggleCollapse   — callback to toggle collapsed state
 */
export default function ActivityFeed({ onTileClick, collapsed = false, onToggleCollapse, address }) {
  const [activeTab, setActiveTab] = useState('activity');
  const [notifications, setNotifications] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  // Fetch notifications when tab opens or address changes
  useEffect(() => {
    if (!address) { setNotifications([]); setNotifCount(0); return; }
    const fetchNotifs = () => {
      setNotifsLoading(true);
      fetch(`/api/notifications?wallet=${address}`)
        .then(r => r.json())
        .then(d => {
          setNotifications(d.notifications || []);
          setNotifCount(d.count || 0);
          setNotifsLoading(false);
        })
        .catch(() => setNotifsLoading(false));
    };
    fetchNotifs();
    const iv = setInterval(fetchNotifs, 30000);
    return () => clearInterval(iv);
  }, [address]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [, setTick] = useState(0);
  const esRef = useRef(null);
  // Use a ref for collapsed so prependEvent stays stable across collapse toggles
  // (avoids SSE reconnect on every collapse/expand)
  const collapsedRef = useRef(collapsed);
  useEffect(() => { collapsedRef.current = collapsed; }, [collapsed]);

  // Prepend a new event (via SSE), bump new-event counter if collapsed
  const prependEvent = useCallback((evt) => {
    setEvents(prev => [evt, ...prev].slice(0, MAX_EVENTS));
    if (collapsedRef.current) setNewCount(n => n + 1);
  }, []);

  // Initial load
  useEffect(() => {
    fetch('/api/activities?limit=20&stream=all')
      .then(r => r.json())
      .then(d => {
        setEvents((d.events || []).slice(0, MAX_EVENTS));
        setLoading(false);
      })
      .catch(() => { setLoading(false); setFeedError(true); });
  }, []);

  // Polling fallback (every 30s) in case SSE misses events
  useEffect(() => {
    const iv = setInterval(() => {
      fetch('/api/activities?limit=20&stream=all')
        .then(r => r.json())
        .then(d => {
          const incoming = (d.events || []).slice(0, MAX_EVENTS);
          setEvents(prev => {
            if (!prev.length) return incoming;
            const latestTs = prev[0]?.timestamp;
            const newer = incoming.filter(e => e.timestamp > latestTs);
            if (!newer.length) return prev;
            if (collapsedRef.current) setNewCount(n => n + newer.length);
            return [...newer, ...prev].slice(0, MAX_EVENTS);
          });
        })
        .catch(() => {});
      // Also tick for relative timestamps
      setTick(t => t + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  // SSE connection for instant updates
  useEffect(() => {
    const es = new EventSource('/api/events');
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const evt = normalizeSSEEvent(data);
        if (evt) prependEvent(evt);
      } catch {}
    };

    return () => es.close();
  }, [prependEvent]);

  // Clear new-event badge when expanded
  useEffect(() => {
    if (!collapsed) setNewCount(0);
  }, [collapsed]);

  // ─── Collapsed mode: single-line strip ──────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-dim bg-surface-alt text-[18px] transition-colors hover:border-accent-purple hover:bg-[#1a1a3e] relative"
        title="Show activity feed"
      >
        📡
        {(newCount + notifCount) > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-purple px-1 text-[9px] font-bold text-white">
            {(newCount + notifCount) > 9 ? '9+' : (newCount + notifCount)}
          </span>
        )}
      </button>
    );
  }

  // ─── Expanded mode: feed panel ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-dim shrink-0">
        <div className="flex items-center gap-0">
          <button
            onClick={() => setActiveTab('activity')}
            className={`px-2 py-1 text-[12px] font-semibold rounded-l-md border border-border-dim transition-colors ${
              activeTab === 'activity'
                ? 'bg-[#1a1a3e] text-text border-accent-purple'
                : 'bg-transparent text-text-dim hover:text-text'
            }`}
          >
            📡 Activity
            {!loading && events.length > 0 && activeTab === 'activity' && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`relative px-2 py-1 text-[12px] font-semibold rounded-r-md border border-l-0 border-border-dim transition-colors ${
              activeTab === 'notifications'
                ? 'bg-[#1a1a3e] text-text border-accent-purple'
                : 'bg-transparent text-text-dim hover:text-text'
            }`}
          >
            🔔 Alerts
            {notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orange-500 px-0.5 text-[8px] font-bold text-white">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'activity' && (
            <Link
              href="/activity"
              className="text-[10px] text-text-dim no-underline hover:text-text"
              title="Full activity page"
            >
              See all →
            </Link>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="ml-1 rounded p-0.5 text-[14px] text-text-dim hover:text-text"
              title="Hide activity feed"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <>
          {!address && (
            <div className="px-3 py-4 text-center text-[11px] text-text-dim">Connect wallet to see notifications</div>
          )}
          {address && notifsLoading && notifications.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-text-dim">Loading…</div>
          )}
          {address && !notifsLoading && notifications.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-text-dim">No notifications — all clear! ✨</div>
          )}
          {notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => onTileClick?.(notif.tileId)}
              className="flex w-full items-center gap-2 border-b border-border-dim px-3 py-2.5 text-left transition-colors hover:bg-[#1a1a3e] cursor-pointer"
            >
              <span className="shrink-0 text-[16px]">🔗</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-text leading-tight">
                  {notif.fromTile?.name || `Tile #${notif.fromTile?.id}`}
                </div>
                <div className="text-[10px] text-text-dim leading-tight">
                  wants to connect with <strong>{notif.tileName}</strong>
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-text-dim">{relativeTime(notif.createdAt)}</span>
            </button>
          ))}
        </>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <>
        {loading && (
          <div className="px-3 py-4 text-center text-[11px] text-text-dim">Loading…</div>
        )}
        {!loading && feedError && (
          <div className="px-3 py-4 text-center text-[11px] text-text-dim">Feed unavailable</div>
        )}
        {!loading && !feedError && events.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-text-dim">No activity yet</div>
        )}
        {events.map((evt, i) => (
          <button
            key={`${evt.tileId}-${evt.timestamp}-${i}`}
            onClick={() => onTileClick?.(evt.tileId)}
            className="flex w-full items-center gap-2 border-b border-border-dim px-3 py-2 text-left transition-colors hover:bg-[#1a1a3e] cursor-pointer"
          >
            {/* Icon */}
            <span className="shrink-0 text-[16px]">
              {evt.type !== 'tile_action' && evt.tileAvatar ? evt.tileAvatar : eventIcon(evt.type, evt.meta)}
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-text leading-tight">
                {evt.tileName || `Tile #${evt.tileId}`}
              </div>
              <div className="text-[10px] text-text-dim leading-tight">
                {eventDescription(evt.type, evt.meta, evt.tileName)}
              </div>
            </div>

            {/* Timestamp */}
            <span className="shrink-0 text-[10px] text-text-dim">{relativeTime(evt.timestamp)}</span>
          </button>
        ))}
        </>
      )}

      </div>
    </div>
  );
}
