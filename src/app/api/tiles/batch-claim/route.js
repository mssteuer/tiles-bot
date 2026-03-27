import { NextResponse } from 'next/server';
import { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPrice } from '@/lib/db';

/**
 * POST /api/tiles/batch-claim
 * Body: { tileIds: number[], wallet?: string }
 * 
 * Claims multiple tiles at once. Each tile gets the bonding curve price
 * at time of claim. Already-claimed tiles are skipped (not an error).
 * Returns a summary of claimed/skipped tiles.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tileIds, wallet } = body;

  if (!Array.isArray(tileIds) || tileIds.length === 0) {
    return NextResponse.json({ error: 'tileIds must be a non-empty array' }, { status: 400 });
  }

  if (tileIds.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 tiles per batch' }, { status: 400 });
  }

  // Validate all IDs
  for (const id of tileIds) {
    if (!Number.isInteger(id) || id < 0 || id >= TOTAL_TILES) {
      return NextResponse.json({ error: `Invalid tile ID: ${id}` }, { status: 400 });
    }
  }

  // Use a placeholder wallet if not provided (for demo/dev mode)
  const ownerWallet = wallet || '0x0000000000000000000000000000000000000000';

  const claimed = [];
  const skipped = [];
  let totalPrice = 0;

  for (const id of tileIds) {
    const price = getCurrentPrice();
    const tile = claimTile(id, ownerWallet, price);
    if (tile) {
      claimed.push({ id, price });
      totalPrice += price;
    } else {
      skipped.push(id);
    }
  }

  return NextResponse.json({
    success: true,
    claimed: claimed.length,
    skipped: skipped.length,
    totalPrice,
    claimedTiles: claimed,
    skippedTiles: skipped,
    stats: {
      totalClaimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
    },
  });
}
