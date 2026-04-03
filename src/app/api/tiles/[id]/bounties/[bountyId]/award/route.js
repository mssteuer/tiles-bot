import { NextResponse } from 'next/server';
import { awardBounty, logEvent } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tiles/:id/bounties/:bountyId/award
 * Award a bounty to a winner (tile owner only).
 * Body: { winner_tile_id, wallet }
 */
export async function POST(request, { params }) {
  const { id, bountyId } = await params;
  const tileId = parseInt(id, 10);
  const bId = parseInt(bountyId, 10);
  if (isNaN(bId) || isNaN(tileId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { winner_tile_id, wallet } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  const winnerTileId = parseInt(winner_tile_id, 10);
  if (isNaN(winnerTileId)) return NextResponse.json({ error: 'Invalid winner_tile_id' }, { status: 400 });

  try {
    const bounty = awardBounty(bId, winnerTileId, wallet);
    logEvent('bounty_awarded', tileId, wallet, {
      bountyId: bId,
      winnerTileId,
      rewardUsdc: bounty.reward_usdc,
    });
    try {
      broadcast({
        type: 'bounty_awarded',
        bountyId: bId,
        tileId,
        winnerTileId,
        rewardUsdc: bounty.reward_usdc,
        wallet,
      });
    } catch {}
    return NextResponse.json({ ok: true, bounty });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to award bounty' }, { status: 400 });
  }
}
