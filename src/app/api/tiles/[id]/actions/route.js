import { NextResponse } from 'next/server';
import { addAction, getActions, getTile, VALID_ACTIONS } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';
import { logEvent } from '@/lib/db';

const ACTION_EMOJIS = {
  slap: '🐟', challenge: '⚔️', praise: '🙌', wave: '👋',
  poke: '👉', taunt: '😈', hug: '🤗', 'high-five': '🖐️',
};

const ACTION_VERBS = {
  slap: 'slapped', challenge: 'challenged', praise: 'praised', wave: 'waved at',
  poke: 'poked', taunt: 'taunted', hug: 'hugged', 'high-five': 'high-fived',
};

export async function GET(req, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const actions = getActions(tileId);

  const enriched = actions.map(a => {
    const fromTile = getTile(a.from_tile);
    const toTile = getTile(a.to_tile);
    return {
      id: a.id,
      fromTile: a.from_tile,
      toTile: a.to_tile,
      fromName: fromTile?.name || `Tile #${a.from_tile}`,
      toName: toTile?.name || `Tile #${a.to_tile}`,
      fromImage: fromTile?.imageUrl || fromTile?.image_url || null,
      toImage: toTile?.imageUrl || toTile?.image_url || null,
      actionType: a.action_type,
      emoji: ACTION_EMOJIS[a.action_type] || '❓',
      verb: ACTION_VERBS[a.action_type] || a.action_type,
      message: a.message,
      actor: a.actor,
      createdAt: a.created_at,
    };
  });
  return NextResponse.json({ actions: enriched, validActions: VALID_ACTIONS });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const toTile = parseInt(id, 10);
  const body = await req.json();
  const { fromTile, actionType, actor, message } = body;

  if (!fromTile || !actionType || !actor) {
    return NextResponse.json({ error: 'fromTile, actionType, and actor required' }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(actionType)) {
    return NextResponse.json({ error: `Invalid action. Valid: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }

  const fromData = getTile(fromTile);
  if (!fromData) {
    return NextResponse.json({ error: 'Source tile not found' }, { status: 404 });
  }
  // Allow if DB owner matches OR tile is claimed (smart wallet: proxy ≠ EOA)
  if (!fromData.owner) {
    return NextResponse.json({ error: 'Source tile not claimed' }, { status: 403 });
  }

  const actionId = addAction(fromTile, toTile, actionType, actor, message);
  const fromName = fromData?.name || `Tile #${fromTile}`;
  const toData = getTile(toTile);
  const toName = toData?.name || `Tile #${toTile}`;
  const emoji = ACTION_EMOJIS[actionType] || '❓';
  const verb = ACTION_VERBS[actionType] || actionType;

  logEvent('tile_action', toTile, actor, { fromTile, actionType, actionId });
  broadcast({
    type: 'tile_action', actionId, fromTile, toTile,
    fromName, toName, emoji, verb, actionType,
    message: message || null,
  });

  return NextResponse.json({ ok: true, actionId, emoji, verb, fromName, toName });
}
