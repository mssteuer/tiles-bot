import { NextResponse } from 'next/server';
import { heartbeat, logEvent, TOTAL_TILES } from '@/lib/db';

export async function POST(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 400 });
  }

  const tile = heartbeat(tileId, body.wallet);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not found or not owned by wallet' }, { status: 404 });
  }

  // Log heartbeat to events_log so it appears in the activity feed
  logEvent('heartbeat', tileId, body.wallet, {
    tileName: tile.name || `Tile #${tileId}`,
    tileAvatar: tile.avatar || null,
  });

  return NextResponse.json(tile);
}
