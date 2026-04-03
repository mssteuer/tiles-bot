import { NextResponse } from 'next/server';
import { getAlliances, createAlliance, logEvent, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/alliances
 * List alliances sorted by territory size (member_count).
 * Query: ?limit=50
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const alliances = getAlliances(limit);
  return NextResponse.json({ alliances });
}

/**
 * POST /api/alliances
 * Create a new alliance.
 * Body: { name, color, founder_tile_id, wallet }
 */
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, color, founder_tile_id, wallet } = body;
  if (!wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  }

  const founderTileId = parseInt(founder_tile_id, 10);
  if (isNaN(founderTileId) || founderTileId < 0 || founderTileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid founder tile ID' }, { status: 400 });
  }

  try {
    const alliance = createAlliance(name, color, founderTileId, wallet);

    logEvent('alliance_created', founderTileId, wallet, {
      allianceId: alliance.id,
      allianceName: alliance.name,
      allianceColor: alliance.color,
    });
    try {
      broadcast({
        type: 'alliance_created',
        allianceId: alliance.id,
        name: alliance.name,
        color: alliance.color,
        founderTileId,
        wallet,
      });
    } catch {}

    return NextResponse.json({ ok: true, alliance }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create alliance' }, { status: 400 });
  }
}
