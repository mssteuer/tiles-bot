import { NextResponse } from 'next/server';
import { getGridState, getClaimedCount, getCurrentPrice, getTotalRevenue, getEstimatedSoldOutRevenue, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats, getAllAllianceTileMap, getTilesWithOpenBounties, getPixelWarsMap, getPixelWarsChampionTiles, getActiveCtfFlag, getActiveTdInvasions, getPerChainStats } from '@/lib/db';
import { getSupportedChains } from '@/lib/chains';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();

  // Per-chain stats in a single GROUP BY query (no N×COUNT overhead)
  const chains = getSupportedChains();
  const chainStats = getPerChainStats();
  const perChain = {};
  for (const chain of chains) {
    const cs = chainStats[chain.id] || { claimed: 0, currentPrice: 0.01, totalRevenue: 0 };
    perChain[chain.id] = {
      name: chain.name,
      ...cs,
    };
  }

  return NextResponse.json({
    tiles: grid.tiles,
    spans: grid.spans,
    alliances: getAllAllianceTileMap(),
    bounties: getTilesWithOpenBounties(),
    pixelWars: getPixelWarsMap(),
    pixelWarsChampions: Array.from(getPixelWarsChampionTiles()),
    ctfFlag: getActiveCtfFlag(),
    tdInvasions: getActiveTdInvasions(),
    pendingRequests: getPendingRequestCounts(),
    stats: {
      claimed: getClaimedCount(),
      total: TOTAL_TILES,
      currentPrice: getCurrentPrice(),
      totalRevenue: getTotalRevenue(),
      estimatedSoldOutRevenue: getEstimatedSoldOutRevenue(),
      perChain,
    },
  });
}
