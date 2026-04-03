'use client';

import { useState, useEffect, useCallback } from 'react';
import { playSound } from '@/lib/sound';

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

function EmptyState({ children }) {
  return <div className="px-4 py-4 text-center text-[13px] text-text-dim">{children}</div>;
}

function SmallAvatar({ src, emoji, size = 20 }) {
  if (src) {
    return <img src={src} alt="" className={size <= 16 ? 'h-4 w-4 rounded-[2px] object-cover' : 'h-5 w-5 rounded-[2px] object-cover'} />;
  }
  return <span className={size <= 16 ? 'text-[11px] leading-none' : 'text-[14px] leading-none'}>{emoji || '🤖'}</span>;
}

function FromTileSelector({ ownedTiles, allTiles, selected, onChange }) {
  if (!ownedTiles || ownedTiles.length <= 1) return null;
  return (
    <div className="mb-2">
      <label className="mb-0.5 block text-[11px] text-text-light">Acting as:</label>
      <select value={selected ?? ''} onChange={e => onChange(parseInt(e.target.value, 10))} className="retro-input w-full text-[12px]">
        {ownedTiles.map(id => {
          const t = allTiles?.[String(id)];
          const label = t?.name ? `${t.name} (#${id})` : `Tile #${id}`;
          return <option key={id} value={id}>{label}</option>;
        })}
      </select>
    </div>
  );
}

function ComposeRow({ text, setText, sending, onSend, placeholder, icon }) {
  const enabled = !!text.trim();
  return (
    <div className="flex gap-1.5">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSend()}
        placeholder={placeholder}
        maxLength={1000}
        className="retro-input flex-1 text-[13px]"
      />
      <button
        onClick={onSend}
        disabled={sending || !enabled}
        className={`btn-retro px-3.5 py-2 text-[13px] ${enabled ? 'btn-retro-primary' : ''} ${enabled ? 'opacity-100' : 'opacity-50'}`}
      >
        {sending ? '…' : icon}
      </button>
    </div>
  );
}

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
      {address && (
        <div className="mb-3">
          <ComposeRow text={text} setText={setText} sending={sending} onSend={handleSend} placeholder="Leave a note…" icon="📝" />
        </div>
      )}
      {notes.length === 0 && <EmptyState>No notes yet. Be the first!</EmptyState>}
      {notes.map(n => (
        <div key={n.id} className="border-b border-border-dim py-2">
          <div className="mb-1 flex items-center gap-1.5">
            <SmallAvatar src={n.authorImage} emoji={null} size={16} />
            <span className="text-[12px] font-semibold text-text-dim">{n.authorName || `${n.author.slice(0, 6)}…${n.author.slice(-4)}`}</span>
            <span className="text-[11px] text-text-gray">{timeAgo(n.createdAt)}</span>
          </div>
          <div className="text-[13px] leading-[1.4] text-text">{n.body}</div>
        </div>
      ))}
    </div>
  );
}

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
    if (data.ok && onAction) {
      playSound('slap');
      onAction({ fromTile, toTile: tile.id, actionType, emoji: ACTION_EMOJIS[actionType], ts: Date.now() });
    }
  }

  return (
    <div>
      <FromTileSelector ownedTiles={ownedTiles} allTiles={allTiles} selected={fromTile} onChange={setFromTile} />
      {address && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {VALID_ACTIONS.map(a => (
            <button
              key={a}
              onClick={() => doAction(a)}
              disabled={sending === a}
              className={`btn-retro whitespace-nowrap px-2.5 py-1.5 text-[12px] ${sending === a ? 'opacity-50' : 'opacity-100'}`}
              title={`/${a} ${tile.name || 'this tile'}`}
            >
              {ACTION_EMOJIS[a]} /{a}
            </button>
          ))}
        </div>
      )}
      {actions.length === 0 && <EmptyState>No actions yet</EmptyState>}
      {actions.map(a => (
        <div key={a.id} className="border-b border-border-dim py-1.5 text-[13px]">
          <span className="mr-1">{a.emoji}</span>
          <strong className="text-text">{a.fromName}</strong>
          <span className="text-text-light"> {a.verb} </span>
          <strong className="text-text">{a.toName}</strong>
          {a.message && <span className="text-text-dim"> — {a.message}</span>}
          <span className="ml-1.5 text-[11px] text-text-gray">{timeAgo(a.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function EmotesTab({ tile, address, ownedTiles, onAction }) {
  const [emotes, setEmotes] = useState([]);
  const [sending, setSending] = useState(null);

  const fetchEmotes = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/emotes`).then(r => r.json()).then(d => setEmotes(d.emotes || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchEmotes(); }, [fetchEmotes]);

  async function doEmote(emoji) {
    if (!address) return;
    const fromTile = ownedTiles?.[0] ?? tile.id;
    setSending(emoji);
    const res = await fetch(`/api/tiles/${tile.id}/emotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromTile, emoji, actor: address }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(null);
    fetchEmotes();
    if (data.ok && onAction) {
      playSound('emote-pop');
      onAction({ fromTile, toTile: tile.id, emoji, actionType: 'emote', ts: Date.now() });
    }
  }

  return (
    <div>
      {address && (
        <div className="mb-3 flex flex-wrap gap-1">
          {ALLOWED_EMOTES.map(e => (
            <button
              key={e}
              onClick={() => doEmote(e)}
              disabled={sending === e}
              className={`btn-retro px-1.5 py-1 text-[18px] leading-none ${sending === e ? 'bg-accent-blue/15 opacity-60' : 'bg-transparent opacity-100'}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {emotes.length === 0 && <EmptyState>No reactions yet</EmptyState>}
      {emotes.map(e => (
        <div key={e.id} className="flex items-center gap-1.5 border-b border-border-dim py-1.5 text-[13px]">
          <span className="text-[18px]">{e.emoji}</span>
          <SmallAvatar src={e.fromImage} size={16} />
          <strong className="text-text">{e.fromName}</strong>
          <span className="ml-auto text-[11px] text-text-gray">{timeAgo(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function MessagesTab({ tile, address, ownedTiles, isOwner }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

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

  function ComposeBar({ placeholder, targetTileId }) {
    return (
      <div>
        {replyTo && (
          <div className="mb-1 flex items-center gap-1 text-[11px] text-text-light">
            ↩ Replying to <strong className="text-text-dim">{replyTo.fromName}</strong>
            <button onClick={() => setReplyTo(null)} className="cursor-pointer border-none bg-transparent px-0.5 text-[11px] text-text-dim">✕</button>
          </div>
        )}
        <ComposeRow text={text} setText={setText} sending={sending} onSend={() => handleSend(targetTileId)} placeholder={placeholder || 'Type a message…'} icon="💌" />
      </div>
    );
  }

  if (!isOwner) {
    if (!address) return <EmptyState>Connect wallet to send a message</EmptyState>;
    return (
      <div>
        <p className="mb-2 text-[12px] text-text-light">Send a private message to this tile&apos;s owner:</p>
        <ComposeBar placeholder="Type a message…" />
      </div>
    );
  }

  return (
    <div>
      {messages.length === 0 && <EmptyState>No messages yet</EmptyState>}
      {messages.map(m => {
        let body;
        try { body = decodeURIComponent(escape(atob(m.encryptedBody))); } catch { body = m.encryptedBody; }
        const isIncoming = m.toTile === tile.id;
        return (
          <div
            key={m.id}
            className={`mb-1.5 rounded-[2px] px-2.5 py-2 ${isIncoming ? 'border-l-[3px] border-accent-blue bg-surface-2' : 'border-l-[3px] border-accent-purple bg-accent-purple/10'}`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-text-dim">{isIncoming ? `← From ${m.fromName}` : `→ To ${m.toName}`}</span>
              <span className="ml-auto text-[11px] text-text-gray">{timeAgo(m.createdAt)}</span>
              {!m.readAt && isIncoming && <span className="rounded-[2px] bg-accent-blue px-1.5 py-px text-[10px] text-white">new</span>}
              {isIncoming && (
                <button
                  onClick={() => setReplyTo({ fromTile: m.fromTile, fromName: m.fromName })}
                  className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-[12px] text-text-light"
                  title={`Reply to ${m.fromName}`}
                >
                  ↩
                </button>
              )}
            </div>
            <div className="text-[13px] leading-[1.4] text-text">{body}</div>
          </div>
        );
      })}
      {address && (
        <div className="mt-2 border-t border-border-dim pt-2">
          <ComposeBar placeholder={replyTo ? `Reply to ${replyTo.fromName}…` : 'Send a message…'} targetTileId={replyTo?.fromTile} />
        </div>
      )}
    </div>
  );
}

// — Challenges Tab ————————————————————————————————————————

const TASK_TYPES = [
  { id: 'general', label: 'General' },
  { id: 'code_quality', label: 'Code' },
  { id: 'trivia', label: 'Trivia' },
  { id: 'market_prediction', label: 'Prediction' },
  { id: 'speed', label: 'Speed' },
  { id: 'creativity', label: 'Creativity' },
];

const CHALLENGE_STATUS_LABELS = {
  pending: { label: 'Pending acceptance', color: '#f59e0b' },
  active: { label: 'In progress', color: '#3b82f6' },
  completed: { label: 'Completed', color: '#22c55e' },
  expired: { label: 'Expired', color: '#6b7280' },
};

function ChallengesTab({ tile, address, ownedTiles, allTiles }) {
  const [challenges, setChallenges] = useState([]);
  const [taskType, setTaskType] = useState('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [submitScore, setSubmitScore] = useState({}); // {[challengeId]: score}
  const [submitting, setSubmitting] = useState(null);

  const fromTileId = ownedTiles?.[0] ?? null;

  const fetchChallenges = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/challenges`).then(r => r.json()).then(d => setChallenges(d.challenges || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  async function handleChallenge() {
    if (!fromTileId || !address) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tiles/${fromTileId}/challenges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: tile.id, taskType, message: message.trim() || null, wallet: address }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage('');
        fetchChallenges();
      } else {
        alert(data.error || 'Failed to issue challenge');
      }
    } finally {
      setSending(false);
    }
  }

  async function handleAccept(challengeId) {
    if (!address) return;
    const res = await fetch(`/api/tiles/${tile.id}/challenges/${challengeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept', wallet: address }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) fetchChallenges();
    else alert(data.error || 'Failed to accept challenge');
  }

  async function handleSubmitScore(challengeId, participantTileId) {
    const score = parseFloat(submitScore[challengeId]);
    if (isNaN(score) || score < 0 || score > 100) { alert('Enter a valid score (0–100)'); return; }
    setSubmitting(challengeId);
    try {
      const res = await fetch(`/api/tiles/${participantTileId}/challenges/${challengeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', score, wallet: address }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setSubmitScore(s => ({ ...s, [challengeId]: '' })); fetchChallenges(); }
      else alert(data.error || 'Failed to submit score');
    } finally {
      setSubmitting(null);
    }
  }

  const myOwnedSet = new Set((ownedTiles || []).map(Number));

  return (
    <div>
      {/* Issue challenge button (only for non-owned tiles when wallet connected) */}
      {address && fromTileId && !myOwnedSet.has(tile.id) && (
        <div className="mb-3 rounded-lg border border-border-dim bg-surface-2 p-3">
          <div className="mb-2 text-[12px] font-semibold text-text-dim">⚔️ Challenge this tile</div>
          <div className="mb-2 flex flex-wrap gap-1">
            {TASK_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setTaskType(t.id)}
                className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] ${taskType === t.id ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400' : 'border-border-dim bg-surface-alt text-text-dim'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Optional taunt… (max 200 chars)"
              maxLength={200}
              className="retro-input flex-1 text-[12px]"
            />
            <button
              onClick={handleChallenge}
              disabled={sending}
              className="btn-retro btn-retro-primary px-3 py-1.5 text-[12px]"
            >
              {sending ? '⏳' : '⚔️ Challenge'}
            </button>
          </div>
        </div>
      )}

      {/* Challenge list */}
      {challenges.length === 0 && <EmptyState>No challenges yet</EmptyState>}
      {challenges.map(ch => {
        const isChallenger = myOwnedSet.has(ch.challenger_id);
        const isDefender = myOwnedSet.has(ch.defender_id);
        const isParticipant = isChallenger || isDefender;
        const myTileId = isChallenger ? ch.challenger_id : ch.defender_id;
        const statusInfo = CHALLENGE_STATUS_LABELS[ch.status] || { label: ch.status, color: '#6b7280' };

        return (
          <div key={ch.id} className="mb-2 rounded-lg border border-border-dim bg-surface-2 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[13px]">⚔️</span>
              <span className="text-[12px] font-semibold text-text">
                {ch.challenger_name || `Tile #${ch.challenger_id}`} vs {ch.defender_name || `Tile #${ch.defender_id}`}
              </span>
              <span className="ml-auto text-[10px] font-semibold" style={{ color: statusInfo.color }}>{statusInfo.label}</span>
            </div>
            <div className="mb-1 text-[11px] text-text-dim">
              Task: <strong>{ch.task_type}</strong>
              {ch.message && <span> · &ldquo;{ch.message}&rdquo;</span>}
            </div>
            {ch.status === 'completed' && (
              <div className="text-[12px]">
                {ch.winner_id ? (
                  <span style={{ color: '#f59e0b' }}>🏆 Winner: {ch.winner_name || `Tile #${ch.winner_id}`} ({ch.challenger_score ?? '?'} vs {ch.defender_score ?? '?'})</span>
                ) : (
                  <span className="text-text-dim">Tie! ({ch.challenger_score} vs {ch.defender_score})</span>
                )}
              </div>
            )}
            {/* Accept button for defender */}
            {ch.status === 'pending' && isDefender && address && (
              <button
                onClick={() => handleAccept(ch.id)}
                className="btn-retro btn-retro-green mt-1.5 px-3 py-1 text-[11px]"
              >
                Accept Challenge
              </button>
            )}
            {/* Score submission for active challenges */}
            {ch.status === 'active' && isParticipant && address && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[11px] text-text-dim">Your score:</span>
                <input
                  type="number" min="0" max="100"
                  value={submitScore[ch.id] ?? ''}
                  onChange={e => setSubmitScore(s => ({ ...s, [ch.id]: e.target.value }))}
                  placeholder="0–100"
                  className="retro-input w-16 text-[11px]"
                />
                <button
                  onClick={() => handleSubmitScore(ch.id, myTileId)}
                  disabled={submitting === ch.id}
                  className="btn-retro btn-retro-primary px-2 py-0.5 text-[11px]"
                >
                  {submitting === ch.id ? '⏳' : 'Submit'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// — Pixel Wars Tab ——————————————————————————————————————————————————————
function PixelWarsTab({ tile, address, ownedTiles }) {
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paintColor, setPaintColor] = useState('#ff4500');
  const [targetTileId, setTargetTileId] = useState('');
  const [msg, setMsg] = useState('');
  const [painting, setPainting] = useState(false);

  useEffect(() => {
    fetch('/api/games/pixel-wars/leaderboard').then(r => r.json()).then(setLeaderboard).catch(() => {});
  }, [tile.id]);

  // Owned tile IDs for painting from
  const myOwnedIds = ownedTiles ? ownedTiles.map(t => t.id || t) : [];
  const [fromTileId, setFromTileId] = useState('');

  async function handlePaint(e) {
    e.preventDefault();
    const fId = parseInt(fromTileId, 10);
    const tId = parseInt(targetTileId, 10);
    if (isNaN(fId) || isNaN(tId)) { setMsg('Enter valid tile IDs'); return; }
    if (!address) { setMsg('Connect wallet first'); return; }
    setPainting(true);
    setMsg('');
    try {
      const res = await fetch('/api/games/pixel-wars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerTileId: fId, targetTileId: tId, color: paintColor, wallet: address }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`🎨 Painted tile #${tId}! Expires in 1h.`);
        fetch('/api/games/pixel-wars/leaderboard').then(r => r.json()).then(setLeaderboard).catch(() => {});
      } else {
        setMsg(data.error || 'Failed to paint');
      }
    } catch { setMsg('Network error'); }
    finally { setPainting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-text-dim">
        Paint unclaimed tiles adjacent to your own. Each tile stays painted for 1 hour. Max 5 paints/hour.
        Round winner (most tiles painted) earns the 🎨 Pixel Champion badge.
      </div>

      {address && myOwnedIds.length > 0 ? (
        <form onSubmit={handlePaint} className="rounded border border-border-bright bg-surface-2 p-2 space-y-2">
          <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Paint a Tile</div>
          <div className="flex gap-2 items-center">
            <label className="text-[11px] text-text-dim w-20">From tile</label>
            <select value={fromTileId} onChange={e => setFromTileId(e.target.value)}
              className="retro-input flex-1 text-[12px]">
              <option value="">Pick your tile</option>
              {myOwnedIds.map(id => <option key={id} value={id}>#{id}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[11px] text-text-dim w-20">Target tile</label>
            <input value={targetTileId} onChange={e => setTargetTileId(e.target.value)}
              placeholder="Unclaimed adjacent #" className="retro-input flex-1 text-[12px]" />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[11px] text-text-dim w-20">Color</label>
            <input type="color" value={paintColor} onChange={e => setPaintColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-border-bright bg-surface-2" />
            <span className="text-[11px] text-text-dim font-mono">{paintColor}</span>
          </div>
          <button type="submit" disabled={painting} className="btn-retro btn-retro-primary px-3 py-1 text-[12px] w-full">
            {painting ? 'Painting...' : '🎨 Paint'}
          </button>
          {msg && <div className="text-[11px] text-accent-blue">{msg}</div>}
        </form>
      ) : (
        <div className="text-[11px] text-text-dim rounded border border-border-bright bg-surface-2 px-2 py-1.5">
          {!address ? 'Connect wallet to paint tiles.' : 'Claim a tile first to participate.'}
        </div>
      )}

      {leaderboard && (
        <>
          {leaderboard.champion && (
            <div className="rounded border border-[#f59e0b] bg-surface-2 px-2 py-1.5 flex items-center gap-2">
              <span className="text-base">🎨</span>
              <div>
                <div className="text-[11px] font-semibold text-[#f59e0b]">Pixel Champion</div>
                <div className="text-[12px] text-text">{leaderboard.champion.tile_name || `Tile #${leaderboard.champion.tile_id}`}</div>
              </div>
            </div>
          )}
          {leaderboard.round && (
            <div className="text-[11px] text-text-dim">
              Round ends: {new Date(leaderboard.round.ends_at + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {leaderboard.entries && leaderboard.entries.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-text-dim uppercase tracking-wide">Leaderboard</div>
              <div className="space-y-1">
                {leaderboard.entries.map((e, i) => (
                  <div key={e.owner} className="flex items-center gap-2 rounded border border-border-bright bg-surface-2 px-2 py-1">
                    <span className="text-[11px] text-text-dim w-4">{i + 1}.</span>
                    <span className="text-[12px] text-text flex-1 truncate">{e.tile_name || `Tile #${e.owner_tile}`}</span>
                    <span className="text-[11px] text-text-dim">{e.paint_count} 🎨</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'actions', label: 'Actions' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'messages', label: 'DMs' },
  { id: 'challenges', label: '⚔️' },
  { id: 'alliance', label: '🤝' },
  { id: 'bounties', label: '💰' },
  { id: 'pixelwars', label: '🎨' },
];

function BountiesTab({ tile, address, ownedTiles, isOwner }) {
  const [bounties, setBounties] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', reward_usdc: '', expires_at: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchBounties = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/bounties`).then(r => r.json()).then(d => setBounties(d.bounties || [])).catch(() => {});
  }, [tile.id]);

  useEffect(() => { fetchBounties(); }, [fetchBounties]);

  async function handleCreate() {
    if (!form.title.trim() || !address) return;
    setLoading(true); setMsg('');
    const res = await fetch(`/api/tiles/${tile.id}/bounties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, wallet: address }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setMsg(data.error || 'Failed'); return; }
    setMsg('Bounty posted!');
    setForm({ title: '', description: '', reward_usdc: '', expires_at: '' });
    setShowCreate(false);
    fetchBounties();
  }

  async function handleSubmit(bountyId) {
    const answer = prompt('Your answer (text or URL):');
    if (!answer || !address) return;
    const fromTile = ownedTiles?.[0];
    if (fromTile == null) { alert('You need to own a tile to submit'); return; }
    const isUrl = answer.startsWith('http');
    const res = await fetch(`/api/tiles/${tile.id}/bounties/${bountyId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tile_id: fromTile,
        [isUrl ? 'url' : 'answer_text']: answer,
        wallet: address,
      }),
    });
    if (res.ok) { fetchBounties(); } else { const d = await res.json(); alert(d.error || 'Failed'); }
  }

  function timeLeft(expiresAt) {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt + 'Z').getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const h = Math.floor(ms / 3600000);
    return h < 24 ? `${h}h left` : `${Math.floor(h / 24)}d left`;
  }

  return (
    <div className="space-y-3">
      {isOwner && (
        <div>
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="btn-retro btn-retro-primary px-3 py-1.5 text-[12px] w-full">
              + Post Bounty
            </button>
          ) : (
            <div className="rounded border border-border-bright bg-surface-2 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">New Bounty</div>
              <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="What do you need?" maxLength={100} className="retro-input w-full text-[12px]" />
              <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Details (optional)" maxLength={500} rows={2} className="retro-input w-full text-[12px]" />
              <div className="flex gap-2">
                <input value={form.reward_usdc} onChange={e => setForm(f => ({...f, reward_usdc: e.target.value}))} placeholder="Reward (USDC)" type="number" step="0.01" min="0" className="retro-input flex-1 text-[12px]" />
                <input value={form.expires_at} onChange={e => setForm(f => ({...f, expires_at: e.target.value}))} type="datetime-local" className="retro-input flex-1 text-[12px]" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={loading || !form.title.trim()} className="btn-retro btn-retro-primary px-3 py-1 text-[12px] flex-1">Post</button>
                <button onClick={() => setShowCreate(false)} className="btn-retro px-3 py-1 text-[12px] flex-1">Cancel</button>
              </div>
              {msg && <div className="text-[11px] text-accent-blue">{msg}</div>}
            </div>
          )}
        </div>
      )}

      {bounties.length === 0 ? (
        <div className="text-[12px] text-text-dim text-center py-3">No bounties posted yet.</div>
      ) : (
        <div className="space-y-2">
          {bounties.map(b => (
            <div key={b.id} className="rounded border border-border-bright bg-surface-2 p-2.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-semibold text-[12px] text-text">{b.title}</span>
                {b.reward_usdc > 0 && (
                  <span className="text-[11px] font-bold text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded flex-shrink-0">${b.reward_usdc}</span>
                )}
              </div>
              {b.description && <p className="text-[11px] text-text-dim mb-1.5 line-clamp-2">{b.description}</p>}
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <span className={`px-1.5 py-0.5 rounded ${b.status === 'open' ? 'bg-green-500/15 text-green-400' : b.status === 'awarded' ? 'bg-purple-500/15 text-purple-400' : 'bg-gray-500/15 text-gray-400'}`}>{b.status}</span>
                <span>{b.submission_count} sub{b.submission_count !== 1 ? 's' : ''}</span>
                {b.expires_at && <span className="text-yellow-400">{timeLeft(b.expires_at)}</span>}
                {b.status === 'open' && !isOwner && address && ownedTiles?.length > 0 && (
                  <button onClick={() => handleSubmit(b.id)} className="ml-auto btn-retro px-2 py-0.5 text-[10px]">Submit</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <a href="/bounties" target="_blank" className="block text-center text-[11px] text-accent-blue hover:underline">View all bounties →</a>
    </div>
  );
}

function AllianceTab({ tile, address, ownedTiles }) {
  const [alliance, setAlliance] = useState(null);
  const [alliances, setAlliancesList] = useState([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [joinId, setJoinId] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const isOwnerOfTile = address && tile.owner && address.toLowerCase() === tile.owner.toLowerCase();
  const fromTile = isOwnerOfTile ? tile.id : ownedTiles?.[0];

  const fetchAlliance = useCallback(() => {
    fetch(`/api/tiles/${tile.id}/alliance`).then(r => r.json()).then(d => setAlliance(d.alliance || null)).catch(() => {});
  }, [tile.id]);

  const fetchAlliances = useCallback(() => {
    fetch('/api/alliances?limit=10').then(r => r.json()).then(d => setAlliancesList(d.alliances || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchAlliance(); fetchAlliances(); }, [fetchAlliance, fetchAlliances]);

  async function handleCreate() {
    if (!newName.trim() || !isOwnerOfTile) return;
    setLoading(true); setMsg('');
    const res = await fetch('/api/alliances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor, founder_tile_id: tile.id, wallet: address }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setMsg(data.error || 'Failed'); return; }
    setMsg('Alliance created!');
    setNewName('');
    fetchAlliance(); fetchAlliances();
  }

  async function handleJoin() {
    const id = parseInt(joinId, 10);
    if (isNaN(id) || !isOwnerOfTile) return;
    setLoading(true); setMsg('');
    const res = await fetch(`/api/alliances/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tile_id: tile.id, wallet: address }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setMsg(data.error || 'Failed'); return; }
    setMsg('Joined!');
    setJoinId('');
    fetchAlliance(); fetchAlliances();
  }

  async function handleLeave() {
    if (!alliance || !isOwnerOfTile) return;
    setLoading(true); setMsg('');
    const res = await fetch(`/api/alliances/${alliance.id}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tile_id: tile.id, wallet: address }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setMsg(data.error || 'Failed'); return; }
    setMsg(data.disbanded ? 'Alliance disbanded.' : 'Left alliance.');
    fetchAlliance(); fetchAlliances();
  }

  return (
    <div className="space-y-3">
      {/* Current alliance status */}
      {alliance ? (
        <div className="rounded border border-border-bright bg-surface-2 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: alliance.color }} />
            <span className="font-semibold text-[13px] text-text">{alliance.name}</span>
            <span className="text-[11px] text-text-dim ml-auto">{alliance.member_count} tile{alliance.member_count !== 1 ? 's' : ''}</span>
          </div>
          <div className="text-[11px] text-text-dim mb-2">Tile #{tile.id} is in this alliance.</div>
          {isOwnerOfTile && (
            <button onClick={handleLeave} disabled={loading} className="btn-retro px-3 py-1 text-[12px] opacity-70 hover:opacity-100">
              Leave
            </button>
          )}
        </div>
      ) : (
        isOwnerOfTile && (
          <div className="space-y-2">
            <div className="text-[12px] text-text-dim">This tile is not in any alliance.</div>
            {/* Create */}
            <div className="rounded border border-border-bright bg-surface-2 p-2 space-y-1.5">
              <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Create Alliance</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Alliance name" maxLength={32} className="retro-input w-full text-[12px]" />
              <div className="flex gap-2 items-center">
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-border-bright bg-surface-2" />
                <span className="text-[11px] text-text-dim">Color</span>
              </div>
              <button onClick={handleCreate} disabled={loading || !newName.trim()} className="btn-retro btn-retro-primary px-3 py-1 text-[12px] w-full">
                Create
              </button>
            </div>
            {/* Join */}
            <div className="rounded border border-border-bright bg-surface-2 p-2 space-y-1.5">
              <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide">Join Alliance</div>
              <div className="flex gap-1.5">
                <input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Alliance ID" className="retro-input flex-1 text-[12px]" />
                <button onClick={handleJoin} disabled={loading || !joinId} className="btn-retro btn-retro-primary px-3 py-1 text-[12px]">Join</button>
              </div>
            </div>
          </div>
        )
      )}
      {msg && <div className="text-[11px] text-accent-blue">{msg}</div>}
      {/* Leaderboard */}
      <div>
        <div className="mb-1 text-[11px] font-semibold text-text-dim uppercase tracking-wide">Top Alliances</div>
        {alliances.length === 0 ? (
          <div className="text-[12px] text-text-dim">No alliances yet.</div>
        ) : (
          <div className="space-y-1">
            {alliances.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2 rounded border border-border-bright bg-surface-2 px-2 py-1">
                <span className="text-[11px] text-text-dim w-4">{i + 1}.</span>
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                <span className="text-[12px] text-text flex-1 truncate">{a.name}</span>
                <span className="text-[11px] text-text-dim">{a.member_count}T</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InteractionsPanel({ tile, address, ownedTiles, isOwner, allTiles, onAction }) {
  const [tab, setTab] = useState('notes');

  if (!tile) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 text-[14px] font-semibold text-text-dim">Interactions</div>
      <div className="mb-3 flex gap-1">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative cursor-pointer rounded-sm border-2 font-body text-[12px] min-w-0 flex-1 !px-1 py-1.5 text-center ${active ? 'border-accent-blue bg-accent-blue/15 font-semibold text-text' : 'border-border-bright bg-surface-2 text-text-dim font-normal hover:border-accent-blue/50'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'notes' && <NotesTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'actions' && <ActionsTab tile={tile} address={address} ownedTiles={ownedTiles} allTiles={allTiles} onAction={onAction} />}
      {tab === 'emotes' && <EmotesTab tile={tile} address={address} ownedTiles={ownedTiles} onAction={onAction} />}
      {tab === 'messages' && <MessagesTab tile={tile} address={address} ownedTiles={ownedTiles} isOwner={isOwner} />}
      {tab === 'challenges' && <ChallengesTab tile={tile} address={address} ownedTiles={ownedTiles} allTiles={allTiles} />}
      {tab === 'alliance' && <AllianceTab tile={tile} address={address} ownedTiles={ownedTiles} />}
      {tab === 'bounties' && <BountiesTab tile={tile} address={address} ownedTiles={ownedTiles} isOwner={isOwner} />}
      {tab === 'pixelwars' && <PixelWarsTab tile={tile} address={address} ownedTiles={ownedTiles} />}
    </div>
  );
}
