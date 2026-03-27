import { NextResponse } from 'next/server';
import { getClaimedCount, getCurrentPrice, TOTAL_TILES } from '@/lib/db';

export async function GET() {
  return NextResponse.json({
    claimed: getClaimedCount(),
    available: TOTAL_TILES - getClaimedCount(),
    total: TOTAL_TILES,
    currentPrice: getCurrentPrice(),
    // TODO: floor price from secondary market (OpenSea/Reservoir API)
    floorPrice: null,
  });
}
