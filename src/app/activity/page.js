'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
    default: return '📡';
  }
}

function eventLabel(type, meta) {
  switch (type) {
    case 'claimed': return 'Tile Claimed';
    case 'tile_image_updated': return 'Image Updated';
    case 'connection_accepted': return 'Connection Made';
    case 'metadata_updated': return 'Profile Updated';
    case 'note_added': return 'Note Left';
    case 'tile_action': {
      const verb = ACTION_VERBS[meta?.actionType] || meta?.actionType || 'acted on';
      const fromName = meta?.fromName || (meta?.fromTile ? `Tile #${meta.fromTile}` : null);
      return fromName ? `${fromName} ${verb} this tile` : `Action: ${verb}`;
    }
    case 'tile_emote': return 'Emote Sent';
    case 'tile_message': return 'Message Received';
    default: return 'Event';
  }
}

export default function ActivityPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const prependEvent = useCallback((newEvent) => {
    setEvents(prev => [newEvent, ...prev].slice(0, 100));
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
        } else if (data.type === 'note_added') {
          prependEvent({
            type: 'note_added',
            tileId: data.tileId,
            tileName: data.tileName ?? `Tile #${data.tileId}`,
            tileAvatar: null,
            owner: data.author || '',
            timestamp: now,
            meta: { noteId: data.noteId, authorTile: data.authorTile },
          });
        } else if (data.type === 'tile_action') {
          prependEvent({
            type: 'tile_action',
            tileId: data.toTile,
            tileName: data.toName ?? `Tile #${data.toTile}`,
            tileAvatar: data.emoji || null,
            owner: data.actor || '',
            timestamp: now,
            meta: {
              fromTile: data.fromTile,
              fromName: data.fromName,
              actionType: data.actionType,
              actionId: data.actionId,
            },
          });
        } else if (data.type === 'tile_emote') {
          prependEvent({
            type: 'tile_emote',
            tileId: data.toTile,
            tileName: data.toName ?? `Tile #${data.toTile}`,
            tileAvatar: null,
            owner: data.actor || '',
            timestamp: now,
            meta: { emoji: data.emoji, fromTile: data.fromTile, fromName: data.fromName },
          });
        }
      } catch {}
    };

    return () => es.close();
  }, [prependEvent]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-surface-dark font-body text-text">
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border-dim bg-linear-to-b from-surface-alt to-surface-dark px-6 py-3.5">
        <Link href="/" className="text-[14px] text-text-dim no-underline">← Grid</Link>
        <span className="text-text-dim">|</span>
        <span className="text-[18px] font-bold">📡 Activity Feed</span>
      </div>

      <div className="mx-auto max-w-[800px] px-5 py-4">
        {loading && (
          <div className="px-10 py-10 text-center text-text-light">Loading activity…</div>
        )}

        {!loading && events.length === 0 && (
          <div className="rounded-xl border border-border-dim bg-[#0d0d1a] px-6 py-15 text-center text-text-light">
            <div className="mb-4 text-[48px]">📡</div>
            <p className="m-0 text-[16px]">No activity yet — be the first to claim a tile!</p>
          </div>
        )}

        {events.map((evt, i) => (
          <Link
            key={`${evt.tileId}-${evt.timestamp}-${i}`}
            href={`/?tile=${evt.tileId}`}
            className="mb-2 block text-inherit no-underline"
          >
            <div className="flex cursor-pointer items-center gap-3.5 rounded-[10px] border border-border-dim bg-[#0d0d1a] px-4 py-3.5 transition-colors hover:border-[#2a2a4e]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[20px]">
                {(evt.type !== 'tile_action' && evt.tileAvatar) || eventIcon(evt.type, evt.meta)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{evt.tileName || `Tile #${evt.tileId}`}</span>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-accent-purple">#{evt.tileId}</span>
                </div>
                <div className="mt-[3px] text-[12px] text-text-light">
                  {eventLabel(evt.type, evt.meta)} • {truncateAddress(evt.owner)}
                </div>
              </div>

              <div className="shrink-0 whitespace-nowrap text-[12px] text-text-dim">{relativeTime(evt.timestamp)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
