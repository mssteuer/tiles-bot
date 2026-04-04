import { NextResponse } from 'next/server';
import { getGridState, getClaimedCount, getCurrentPrice, getTotalRevenue, getEstimatedSoldOutRevenue, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats, getAllAllianceTileMap, getTilesWithOpenBounties, getActivePixelWarsMap, getActiveCtfFlag } from '@/lib/db';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();
  return NextResponse.json({
    tiles: grid.tiles,
    spans: grid.spans,
    alliances: getAllAllianceTileMap(),
    bounties: getTilesWithOpenBounties(),
    pixelWars: getActivePixelWarsMap(),
    ctfFlag: getActiveCtfFlag(),
    pendingRequests: getPendingRequestCounts(),
    stats: {
      claimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
      totalRevenue: getTotalRevenue(),
      estimatedSoldOutRevenue: getEstimatedSoldOutRevenue(),
    },
  });
}
