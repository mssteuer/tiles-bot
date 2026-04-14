import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { leaveAlliance, logEvent, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/alliances/:id/leave
 * Leave an alliance.
 * Body: { tile_id, wallet }
 */
export async function POST(request, { params }) {
  const disabled = featureDisabled(FEATURES.ALLIANCES, 'Alliances');
  if (disabled) return disabled;

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
    const result = leaveAlliance(allianceId, tileId, wallet);

    logEvent('alliance_left', tileId, wallet, {
      allianceId,
      disbanded: result === null,
    });
    try {
      broadcast({
        type: result === null ? 'alliance_disbanded' : 'alliance_left',
        allianceId,
        tileId,
        wallet,
      });
    } catch {}

    if (result === null) {
      return NextResponse.json({ ok: true, disbanded: true });
    }
    return NextResponse.json({ ok: true, alliance: result });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to leave alliance' }, { status: 400 });
  }
}
