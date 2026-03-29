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
    const fromTile = ownedTiles?.[0] || null;
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
      {notes.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>No notes yet. Be the first!</div>}
      {notes.map(n => (
        <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <SmallAvatar src={n.authorImage} emoji={null} size={16} />
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
              {n.authorName || `${n.author.slice(0, 6)}…${n.author.slice(-4)}`}
            </span>
            <span style={{ color: '#374151', fontSize: 11 }}>{timeAgo(n.createdAt)}</span>
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.4 }}>{n.body}</div>
        </div>
      ))}
    </div>
  );
}

// — Actions Tab —
function ActionsTab({ tile, address, ownedTiles }) {
  const [actions, setActions] = useState([]);
  const [sending, setSending] = useState(null);

  const fetchActions = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/actions`).then(r => r.json()).then(d => setActions(d.actions || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function doAction(actionType) {
    if (!address || !ownedTiles?.length) return;
    setSending(actionType);
    await fetch(`/api/tiles/${tile.id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile: ownedTiles[0], actionType, actor: address }),
    });
    setSending(null);
    fetchActions();
  }

  return (
    <div>
      {/* Action buttons */}
      {address && ownedTiles?.length > 0 && (
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
      {actions.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>No actions yet</div>}
      {actions.map(a => (
        <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a2e', fontSize: 13 }}>
          <span style={{ marginRight: 4 }}>{a.emoji}</span>
          <strong style={{ color: '#e2e8f0' }}>{a.fromName}</strong>
          <span style={{ color: '#64748b' }}> {a.verb} </span>
          <strong style={{ color: '#e2e8f0' }}>{a.toName}</strong>
          {a.message && <span style={{ color: '#94a3b8' }}> — {a.message}</span>}
          <span style={{ color: '#374151', fontSize: 11, marginLeft: 6 }}>{timeAgo(a.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// — Emotes Tab —
function EmotesTab({ tile, address, ownedTiles }) {
  const [emotes, setEmotes] = useState([]);
  const [sending, setSending] = useState(null);

  const fetchEmotes = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/emotes`).then(r => r.json()).then(d => setEmotes(d.emotes || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchEmotes(); }, [fetchEmotes]);

  async function doEmote(emoji) {
    if (!address || !ownedTiles?.length) return;
    setSending(emoji);
    await fetch(`/api/tiles/${tile.id}/emotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile: ownedTiles[0], emoji, actor: address }),
    });
    setSending(null);
    fetchEmotes();
  }

  return (
    <div>
      {/* Emoji picker */}
      {address && ownedTiles?.length > 0 && (
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
      {emotes.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>No reactions yet</div>}
      {emotes.map(e => (
        <div key={e.id} style={{ padding: '5px 0', borderBottom: '1px solid #1a1a2e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{e.emoji}</span>
          <SmallAvatar src={e.fromImage} size={16} />
          <strong style={{ color: '#e2e8f0' }}>{e.fromName}</strong>
          <span style={{ color: '#374151', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(e.createdAt)}</span>
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

  const fetchMessages = useCallback(() => {
    if (!isOwner || !address) return;
    fetch(`/api/tiles/${tile.id}/messages?wallet=${address}`).then(r => r.json()).then(d => setMessages(d.messages || [])).catch(() => {});
  }, [tile.id, address, isOwner]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function handleSend() {
    if (!text.trim() || !address || !ownedTiles?.length) return;
    setSending(true);
    // For now, send as plaintext (encrypted field = base64 of plaintext)
    // Full E2E encryption requires public key exchange — Phase 2
    const encoded = btoa(unescape(encodeURIComponent(text.trim())));
    await fetch(`/api/tiles/${tile.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromTile: ownedTiles[0], sender: address,
        encryptedBody: encoded, nonce: null,
      }),
    });
    setText('');
    setSending(false);
    // Can't read sent messages unless we also own the target tile
  }

  if (!isOwner) {
    // Non-owner can send but not read
    if (!address || !ownedTiles?.length) {
      return <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>Connect wallet to send a message</div>;
    }
    return (
      <div>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>Send a private message to this tile's owner:</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message…"
            maxLength={1000}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
              background: '#111', border: '1px solid #2a2a3e', color: '#e2e8f0', outline: 'none',
            }}
          />
          <button onClick={handleSend} disabled={sending || !text.trim()} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13,
            background: text.trim() ? '#8b5cf6' : '#1f2937', color: '#fff', cursor: text.trim() ? 'pointer' : 'default',
          }}>
            {sending ? '…' : '💌'}
          </button>
        </div>
      </div>
    );
  }

  // Owner view — read messages
  return (
    <div>
      {messages.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>No messages yet</div>}
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
              <span style={{ color: '#374151', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(m.createdAt)}</span>
              {!m.readAt && isIncoming && <span style={{ background: '#3b82f6', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#fff' }}>new</span>}
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.4 }}>{body}</div>
          </div>
        );
      })}
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

export default function InteractionsPanel({ tile, address, ownedTiles, isOwner }) {
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
            color: tab === t.id ? '#e2e8f0' : '#475569',
            cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400,
            textAlign: 'center', minWidth: 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {/* Tab content */}
      {tab === 'notes' && <NotesTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'actions' && <ActionsTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'emotes' && <EmotesTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'messages' && <MessagesTab tile={tile} address={address} ownedTiles={ownedTiles} isOwner={isOwner} />}
    </div>
  );
}
