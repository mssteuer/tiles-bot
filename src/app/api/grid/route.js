import { NextResponse } from 'next/server';
import { getGridState, getClaimedCount, getCurrentPrice, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats } from '@/lib/db';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();
  return NextResponse.json({
    tiles: grid.tiles,
    spans: grid.spans,
    pendingRequests: getPendingRequestCounts(),
    stats: {
      claimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
    },
  });
}
