import { NextResponse } from 'next/server';
import { getGridState, getClaimedCount, getCurrentPrice, getTotalRevenue, getEstimatedSoldOutRevenue, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats, getAllAllianceTileMap, getTilesWithOpenBounties, getPixelWarsMap, getPixelWarsChampionTiles, getActiveCtfFlag } from '@/lib/db';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();
  return NextResponse.json({
    tiles: grid.tiles,
    spans: grid.spans,
    alliances: getAllAllianceTileMap(),
    bounties: getTilesWithOpenBounties(),
    pixelWars: getPixelWarsMap(),
    pixelWarsChampions: Array.from(getPixelWarsChampionTiles()),
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
