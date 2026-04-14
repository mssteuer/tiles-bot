import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { claimBounty, logEvent } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tiles/:id/bounties/:bountyId/claim
 * Express intent to claim a bounty.
 * Body: { tile_id (claiming tile), wallet }
 */
export async function POST(request, { params }) {

  const disabled = featureDisabled(FEATURES.BOUNTIES, 'Bounties');
  if (disabled) return disabled;
  const { bountyId } = await params;
  const bId = parseInt(bountyId, 10);
  if (isNaN(bId)) {
    return NextResponse.json({ error: 'Invalid bounty ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tile_id, wallet } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  const submitterTileId = parseInt(tile_id, 10);
  if (isNaN(submitterTileId)) return NextResponse.json({ error: 'Invalid tile_id' }, { status: 400 });

  try {
    const bounty = claimBounty(bId, submitterTileId, wallet);
    logEvent('bounty_claimed', submitterTileId, wallet, { bountyId: bId });
    try {
      broadcast({ type: 'bounty_claimed', bountyId: bId, submitterTileId, wallet });
    } catch {}
    return NextResponse.json({ ok: true, bounty });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to claim bounty' }, { status: 400 });
  }
}
