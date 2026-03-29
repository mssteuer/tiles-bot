'use client';

import { useState, useEffect, useCallback } from 'react';

const ACTION_EMOJIS = {
  slap: '🐟', challenge: '⚔️', praise: '🙌', wave: '👋',
  poke: '👉', taunt: '😈', hug: '🤗', 'high-five': '🖐️',
};
const VALID_ACTIONS = ['slap', 'challenge', 'praise', 'wave', 'poke', 'taunt', 'hug', 'high-five'];
const ALLOWED_EMOTES = ['👍', '❤️', '🔥', '😂', '🤔', '👏', '🙌', '💀', '🎉', '⚔️', '🐟', '👀', '🫡', '💪', '🤝'];

function timeAgo(dateStr) {
  const d = new Date(dateStr + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SmallAvatar({ src, emoji, size = 20 }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover' }} />;
  return <span style={{ fontSize: size * 0.7 }}>{emoji || '🤖'}</span>;
}

// — Notes Tab —
function NotesTab({ tile, address, ownedTiles }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchNotes = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/notes`).then(r => r.json()).then(d => setNotes(d.notes || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleSend() {
    if (!text.trim() || !address) return;
    setSending(true);
    const fromTile = ownedTiles?.[0] ?? null;
    await fetch(`/api/tiles/${tile.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: address, authorTile: fromTile, text: text.trim() }),
    });
    setText('');
    setSending(false);
    fetchNotes();
  }

  return (
    <div>
      {/* Compose */}
      {address && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Leave a note…"
            maxLength={500}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
              background: '#111', border: '1px solid #2a2a3e', color: '#e2e8f0', outline: 'none',
            }}
          />
          <button onClick={handleSend} disabled={sending || !text.trim()} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13,
            background: text.trim() ? '#3b82f6' : '#1f2937', color: '#fff', cursor: text.trim() ? 'pointer' : 'default',
          }}>
            {sending ? '…' : '📝'}
          </button>
        </div>
      )}
      {/* Notes list */}
      {notes.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>No notes yet. Be the first!</div>}
      {notes.map(n => (
        <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <SmallAvatar src={n.authorImage} emoji={null} size={16} />
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
              {n.authorName || `${n.author.slice(0, 6)}…${n.author.slice(-4)}`}
            </span>
            <span style={{ color: '#9ca3af', fontSize: 11 }}>{timeAgo(n.createdAt)}</span>
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.4 }}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

// — From-Tile Selector —
function FromTileSelector({ ownedTiles, allTiles, selected, onChange }) {
  if (!ownedTiles || ownedTiles.length <= 1) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 3 }}>Acting as:</label>
      <select value={selected ?? ''} onChange={e => onChange(parseInt(e.target.value, 10))} style={{
        width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #2a2a3e',
        background: '#111', color: '#e2e8f0', fontSize: 12, outline: 'none',
      }}>
        {ownedTiles.map(id => {
          const t = allTiles?.[String(id)];
          const label = t?.name ? `${t.name} (#${id})` : `Tile #${id}`;
          return <option key={id} value={id}>{label}</option>;
        })}
      </select>
    </div>
  );
}

// — Actions Tab —
function ActionsTab({ tile, address, ownedTiles, allTiles, onAction }) {
  const [actions, setActions] = useState([]);
  const [sending, setSending] = useState(null);
  const [fromTile, setFromTile] = useState(ownedTiles?.[0] ?? tile.id);

  useEffect(() => { setFromTile(ownedTiles?.[0] ?? tile.id); }, [ownedTiles, tile.id]);

  const fetchActions = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/actions`).then(r => r.json()).then(d => setActions(d.actions || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function doAction(actionType) {
    if (!address) return;
    setSending(actionType);
    const res = await fetch(`/api/tiles/${tile.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile, actionType, actor: address }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(null);
    fetchActions();
    // Trigger canvas animation
    if (data.ok && onAction) onAction({ fromTile, toTile: tile.id, actionType, emoji: ACTION_EMOJIS[actionType], ts: Date.now() });
  }

  return (
    <div>
      <FromTileSelector ownedTiles={ownedTiles} allTiles={allTiles} selected={fromTile} onChange={setFromTile} />
      {/* Action buttons */}
      {address && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {VALID_ACTIONS.map(a => (
            <button key={a} onClick={() => doAction(a)} disabled={sending === a}
              style={{
                padding: '5px 10px', borderRadius: 8, border: '1px solid #2a2a3e',
                background: sending === a ? '#1f2937' : '#0f0f1a', color: '#94a3b8',
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
              title={`/${a} ${tile.name || 'this tile'}`}
            >
              {ACTION_EMOJIS[a]} /{a}
            </button>
          ))}
        </div>
      )}
      {/* Actions log */}
      {actions.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>No actions yet</div>}
      {actions.map(a => (
        <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a2e', fontSize: 13 }}>
          <span style={{ marginRight: 4 }}>{a.emoji}</span>
          <strong style={{ color: '#e2e8f0' }}>{a.fromName}</strong>
          <span style={{ color: '#cbd5e1' }}> {a.verb} </span>
          <strong style={{ color: '#e2e8f0' }}>{a.toName}</strong>
          {a.message && <span style={{ color: '#94a3b8' }}> — {a.message}</span>}
          <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 6 }}>{timeAgo(a.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// — Emotes Tab —
function EmotesTab({ tile, address, ownedTiles, onAction }) {
  const [emotes, setEmotes] = useState([]);
  const [sending, setSending] = useState(null);

  const fetchEmotes = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/emotes`).then(r => r.json()).then(d => setEmotes(d.emotes || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchEmotes(); }, [fetchEmotes]);

  async function doEmote(emoji) {
    if (!address) return;
    const fromTile = ownedTiles?.[0] ?? tile.id; // fallback to current tile
    setSending(emoji);
    const res = await fetch(`/api/tiles/${tile.id}/emotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile, emoji, actor: address }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(null);
    fetchEmotes();
    if (data.ok && onAction) onAction({ fromTile, toTile: tile.id, emoji, actionType: 'emote', ts: Date.now() });
  }

  return (
    <div>
      {/* Emoji picker */}
      {address && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {ALLOWED_EMOTES.map(e => (
            <button key={e} onClick={() => doEmote(e)} disabled={sending === e}
              style={{
                padding: '4px 6px', borderRadius: 6, border: '1px solid #1a1a2e',
                background: sending === e ? '#1f2937' : 'transparent',
                cursor: 'pointer', fontSize: 18, lineHeight: 1,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {/* Emotes log */}
      {emotes.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>No reactions yet</div>}
      {emotes.map(e => (
        <div key={e.id} style={{ padding: '5px 0', borderBottom: '1px solid #1a1a2e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{e.emoji}</span>
          <SmallAvatar src={e.fromImage} size={16} />
          <strong style={{ color: '#e2e8f0' }}>{e.fromName}</strong>
          <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// — Messages Tab —
function MessagesTab({ tile, address, ownedTiles, isOwner }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { fromTile, fromName } for reply context

  const fetchMessages = useCallback(() => {
    if (!isOwner || !address) return;
    fetch(`/api/tiles/${tile.id}/messages?wallet=${address}`).then(r => r.json()).then(d => setMessages(d.messages || [])).catch(() => {});
  }, [tile.id, address, isOwner]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function handleSend(targetTileId) {
    if (!text.trim() || !address) return;
    setSending(true);
    const fromTile = ownedTiles?.[0] ?? tile.id;
    const toTile = targetTileId || tile.id;
    const encoded = btoa(unescape(encodeURIComponent(text.trim())));
    await fetch(`/api/tiles/${toTile}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile, sender: address, encryptedBody: encoded, nonce: null }),
    });
    setText('');
    setSending(false);
    setReplyTo(null);
    if (isOwner) fetchMessages();
  }

  // Compose bar (shared between owner and non-owner views)
  function ComposeBar({ placeholder, targetTileId }) {
    return (
      <div>
        {replyTo && (
          <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            ↩ Replying to <strong style={{ color: '#94a3b8' }}>{replyTo.fromName}</strong>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>✕</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend(targetTileId)}
            placeholder={placeholder || 'Type a message…'}
            maxLength={1000}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
              background: '#111', border: '1px solid #2a2a3e', color: '#e2e8f0', outline: 'none',
            }}
          />
          <button onClick={() => handleSend(targetTileId)} disabled={sending || !text.trim()} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13,
            background: text.trim() ? '#8b5cf6' : '#1f2937', color: '#fff', cursor: text.trim() ? 'pointer' : 'default',
          }}>
            {sending ? '…' : '💌'}
          </button>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    if (!address) {
      return <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>Connect wallet to send a message</div>;
    }
    return (
      <div>
        <p style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 8 }}>Send a private message to this tile&apos;s owner:</p>
        <ComposeBar placeholder="Type a message…" />
      </div>
    );
  }

  // Owner view — messages + reply
  return (
    <div>
      {messages.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>No messages yet</div>}
      {messages.map(m => {
        let body;
        try { body = decodeURIComponent(escape(atob(m.encryptedBody))); } catch { body = m.encryptedBody; }
        const isIncoming = m.toTile === tile.id;
        return (
          <div key={m.id} style={{
            padding: '8px 10px', marginBottom: 6, borderRadius: 10,
            background: isIncoming ? '#1a1a2e' : 'rgba(139,92,246,0.1)',
            borderLeft: isIncoming ? '3px solid #3b82f6' : '3px solid #8b5cf6',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                {isIncoming ? `← From ${m.fromName}` : `→ To ${m.toName}`}
              </span>
              <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(m.createdAt)}</span>
              {!m.readAt && isIncoming && <span style={{ background: '#3b82f6', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#fff' }}>new</span>}
              {isIncoming && (
                <button onClick={() => setReplyTo({ fromTile: m.fromTile, fromName: m.fromName })}
                  style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}
                  title={`Reply to ${m.fromName}`}
                >↩</button>
              )}
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.4 }}>{body}</div>
          </div>
        );
      })}
      {/* Compose — sends to replyTo tile if set, otherwise generic */}
      {address && (
        <div style={{ marginTop: 8, borderTop: '1px solid #1a1a2e', paddingTop: 8 }}>
          <ComposeBar
            placeholder={replyTo ? `Reply to ${replyTo.fromName}…` : 'Send a message…'}
            targetTileId={replyTo?.fromTile}
          />
        </div>
      )}
    </div>
  );
}

// — Main Panel —
const TABS = [
  { id: 'notes', label: '💬 Notes', shortLabel: '💬' },
  { id: 'actions', label: '⚔️ Actions', shortLabel: '⚔️' },
  { id: 'emotes', label: '🎭 Emotes', shortLabel: '🎭' },
  { id: 'messages', label: '💌 DMs', shortLabel: '💌' },
];

export default function InteractionsPanel({ tile, address, ownedTiles, isOwner, allTiles, onAction }) {
  const [tab, setTab] = useState('notes');

  if (!tile) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
        Interactions
      </div>
      {/* Tab bar */}
      <div style={{ display: 'flex', marginBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', fontSize: 12,
            background: tab === t.id ? '#1e293b' : 'transparent',
            color: tab === t.id ? '#e2e8f0' : '#94a3b8',
            cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400,
            textAlign: 'center', minWidth: 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {/* Tab content */}
      {tab === 'notes' && <NotesTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'actions' && <ActionsTab tile={tile} address={address} ownedTiles={ownedTiles} allTiles={allTiles} onAction={onAction} />}
      {tab === 'emotes' && <EmotesTab tile={tile} address={address} ownedTiles={ownedTiles} onAction={onAction} />}
      {tab === 'messages' && <MessagesTab tile={tile} address={address} ownedTiles={ownedTiles} isOwner={isOwner} />}
    </div>
  );
}
