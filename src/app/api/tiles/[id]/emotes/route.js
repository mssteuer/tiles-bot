import { NextResponse } from 'next/server';
import { addEmote, getEmotes, getTile, ALLOWED_EMOTES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logEvent } from '@/lib/db';

export async function GET(req, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const emotes = getEmotes(tileId);

  const enriched = emotes.map(e => {
    const from = getTile(e.from_tile);
    return {
      id: e.id,
      fromTile: e.from_tile,
      toTile: e.to_tile,
      fromName: from?.name || `Tile #${e.from_tile}`,
      fromImage: from?.imageUrl || from?.image_url || null,
      emoji: e.emoji,
      actor: e.actor,
      createdAt: e.created_at,
    };
  });
  return NextResponse.json({ emotes: enriched, allowedEmotes: ALLOWED_EMOTES });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const toTile = parseInt(id, 10);
  const body = await req.json();
  const { fromTile, emoji, actor } = body;

  if (!fromTile || !emoji || !actor) {
    return NextResponse.json({ error: 'fromTile, emoji, and actor required' }, { status: 400 });
  }
  if (!ALLOWED_EMOTES.includes(emoji)) {
    return NextResponse.json({ error: `Invalid emoji. Allowed: ${ALLOWED_EMOTES.join(' ')}` }, { status: 400 });
  }

  // fromTile just needs to exist. Strict ownership removed — smart wallets make it unreliable
  const fromData = fromTile ? getTile(fromTile) : null;

  const emoteId = addEmote(fromTile, toTile, emoji, actor);
  const fromName = fromData?.name || `Tile #${fromTile}`;
  const toData = getTile(toTile);
  const toName = toData?.name || `Tile #${toTile}`;

  logEvent('emote', toTile, actor, { fromTile, emoji, emoteId });
  broadcast({
    type: 'tile_emote', emoteId, fromTile, toTile,
    fromName, toName, emoji,
  });

  return NextResponse.json({ ok: true, emoteId });
}
