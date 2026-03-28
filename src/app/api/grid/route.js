import { NextResponse } from 'next/server';
import { getAllTiles, getClaimedCount, getCurrentPrice, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats } from '@/lib/db';

export async function GET() {
  checkHeartbeats();
  return NextResponse.json({
    tiles: getAllTiles(),
    pendingRequests: getPendingRequestCounts(),
    stats: {
      claimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
    },
  });
}
