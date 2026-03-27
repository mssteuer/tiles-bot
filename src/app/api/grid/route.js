import { NextResponse } from 'next/server';
import { getAllTiles, getClaimedCount, getCurrentPrice, TOTAL_TILES, checkHeartbeats } from '@/lib/db';

export async function GET() {
  checkHeartbeats();
  return NextResponse.json({
    tiles: getAllTiles(),
    stats: {
      claimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
    },
  });
}
