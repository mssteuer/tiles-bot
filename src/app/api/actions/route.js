import { NextResponse } from 'next/server';
import { getRecentActions, getRecentEmotes, getTile } from '@/lib/db';

const ACTION_EMOJIS = {
  slap: '🐟', challenge: '⚔️', praise: '🙌', wave: '👋',
  poke: '👉', taunt: '😈', hug: '🤗', 'high-five': '🖐️',
};
const ACTION_VERBS = {
  slap: 'slapped', challenge: 'challenged', praise: 'praised', wave: 'waved at',
  poke: 'poked', taunt: 'taunted', hug: 'hugged', 'high-five': 'high-fived',
};

export async function GET(req) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '30', 10);

  const actions = getRecentActions(limit);
  const emotes = getRecentEmotes(limit);

  // Merge and sort by time
  const feed = [
    ...actions.map(a => {
      const from = getTile(a.from_tile);
      const to = getTile(a.to_tile);
      return {
        type: 'action',
        id: `action-${a.id}`,
        fromTile: a.from_tile,
        toTile: a.to_tile,
        fromName: from?.name || `Tile #${a.from_tile}`,
        toName: to?.name || `Tile #${a.to_tile}`,
        fromImage: from?.imageUrl || from?.image_url || null,
        toImage: to?.imageUrl || to?.image_url || null,
        actionType: a.action_type,
        emoji: ACTION_EMOJIS[a.action_type] || '❓',
        verb: ACTION_VERBS[a.action_type] || a.action_type,
        message: a.message,
        createdAt: a.created_at,
      };
    }),
    ...emotes.map(e => {
      const from = getTile(e.from_tile);
      const to = getTile(e.to_tile);
      return {
        type: 'emote',
        id: `emote-${e.id}`,
        fromTile: e.from_tile,
        toTile: e.to_tile,
        fromName: from?.name || `Tile #${e.from_tile}`,
        toName: to?.name || `Tile #${e.to_tile}`,
        fromImage: from?.imageUrl || from?.image_url || null,
        emoji: e.emoji,
        createdAt: e.created_at,
      };
    }),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

  return NextResponse.json({ feed });
}
