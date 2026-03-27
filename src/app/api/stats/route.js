import { NextResponse } from 'next/server';
import { getClaimedCount, getCurrentPrice, TOTAL_TILES, getNextAvailableTileId } from '@/lib/db';

export async function GET() {
  const claimed = getClaimedCount();
  return NextResponse.json({
    claimed,
    available: TOTAL_TILES - claimed,
    total: TOTAL_TILES,
    currentPrice: getCurrentPrice(),
    nextAvailableTileId: getNextAvailableTileId(),
    // TODO: floor price from secondary market (OpenSea/Reservoir API)
    floorPrice: null,
  });
}
