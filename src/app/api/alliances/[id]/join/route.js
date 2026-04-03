import { NextResponse } from 'next/server';
import { joinAlliance, logEvent, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/alliances/:id/join
 * Join an existing alliance.
 * Body: { tile_id, wallet }
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const allianceId = parseInt(id, 10);
  if (isNaN(allianceId)) {
    return NextResponse.json({ error: 'Invalid alliance ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tile_id, wallet } = body;
  if (!wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  }

  const tileId = parseInt(tile_id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  try {
    const alliance = joinAlliance(allianceId, tileId, wallet);

    logEvent('alliance_joined', tileId, wallet, {
      allianceId: alliance.id,
      allianceName: alliance.name,
    });
    try {
      broadcast({
        type: 'alliance_joined',
        allianceId: alliance.id,
        name: alliance.name,
        tileId,
        wallet,
        memberCount: alliance.member_count,
      });
    } catch {}

    return NextResponse.json({ ok: true, alliance });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to join alliance' }, { status: 400 });
  }
}
