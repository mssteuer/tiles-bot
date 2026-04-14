import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getTileBounties, createBounty, logEvent, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tiles/:id/bounties
 * List bounties on a tile.
 * Query: ?status=open (optional)
 */
export async function GET(request, { params }) {
  const disabled = featureDisabled(FEATURES.BOUNTIES, 'Bounties');
  if (disabled) return disabled;

  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const bounties = getTileBounties(tileId, { status });
  return NextResponse.json({ bounties });
}

/**
 * POST /api/tiles/:id/bounties
 * Create a bounty on this tile.
 * Body: { title, description, reward_usdc, expires_at, wallet }
 */
export async function POST(request, { params }) {
  const disabled = featureDisabled(FEATURES.BOUNTIES, 'Bounties');
  if (disabled) return disabled;

  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, reward_usdc, expires_at, wallet } = body;
  if (!wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  }

  try {
    const bounty = createBounty(tileId, { title, description, reward_usdc, expires_at, wallet });

    logEvent('bounty_posted', tileId, wallet, {
      bountyId: bounty.id,
      bountyTitle: bounty.title,
      rewardUsdc: bounty.reward_usdc,
    });
    try {
      broadcast({
        type: 'bounty_posted',
        bountyId: bounty.id,
        tileId,
        title: bounty.title,
        rewardUsdc: bounty.reward_usdc,
        wallet,
      });
    } catch {}

    return NextResponse.json({ ok: true, bounty }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create bounty' }, { status: 400 });
  }
}
