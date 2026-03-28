import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAllBlocks, claimBlock, getCurrentPrice, getClaimedCount, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

/**
 * GET /api/blocks
 * Returns all claimed block tiles.
 */
export async function GET() {
  const blocks = getAllBlocks();
  return NextResponse.json({ blocks });
}

/**
 * POST /api/blocks
 * Claim a 2x2 or 3x3 block of tiles.
 * Body: { topLeftId: number, blockSize: 2|3, wallet?: string }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { topLeftId, blockSize, wallet } = body;

  if (!Number.isInteger(topLeftId) || topLeftId < 0 || topLeftId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid topLeftId' }, { status: 400 });
  }
  if (blockSize !== 2 && blockSize !== 3) {
    return NextResponse.json({ error: 'blockSize must be 2 or 3' }, { status: 400 });
  }

  const ownerWallet = wallet || '0x0000000000000000000000000000000000000000';

  try {
    const result = claimBlock(topLeftId, blockSize, ownerWallet);

    // Calculate total price paid
    const totalPrice = getCurrentPrice() * result.tileIds.length;

    // Broadcast SSE event
    try {
      broadcast({
        type: 'block_claimed',
        blockId: result.blockId,
        topLeftId: result.topLeftId,
        blockSize: result.blockSize,
        tileIds: result.tileIds,
        owner: ownerWallet,
        claimedCount: getClaimedCount(),
        currentPrice: getCurrentPrice(),
      });
    } catch {
      // SSE broadcast is best-effort
    }

    return NextResponse.json({
      success: true,
      block: {
        id: result.blockId,
        blockSize: result.blockSize,
        topLeftId: result.topLeftId,
        tileIds: result.tileIds,
        owner: ownerWallet,
        claimedAt: result.claimedAt,
      },
      totalPrice,
      stats: {
        totalClaimed: getClaimedCount(),
        total: TOTAL_TILES,
        currentPrice: getCurrentPrice(),
      },
    }, { status: 201 });
  } catch (err) {
    const status = err.message.includes('already claimed') ? 409 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
