import { NextResponse } from 'next/server';
import { getGridState, getClaimedCount, getCurrentPrice, getTotalRevenue, getEstimatedSoldOutRevenue, getPendingRequestCounts, TOTAL_TILES, checkHeartbeats, getAllAllianceTileMap, getTilesWithOpenBounties, getPixelWarsMap, getPixelWarsChampionTiles, getActiveCtfFlag, getActiveTdInvasions, getClaimedCountByChain, getCurrentPriceByChain, getTotalRevenueByChain, getEstimatedSoldOutRevenueByChain } from '@/lib/db';
import { getSupportedChains } from '@/lib/chains';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();

  // Per-chain independent pricing
  const chains = getSupportedChains();
  const perChain = {};
  for (const chain of chains) {
    const chainClaimed = getClaimedCountByChain(chain.id);
    perChain[chain.id] = {
      name: chain.name,
      claimed: chainClaimed,
      currentPrice: getCurrentPriceByChain(chain.id),
      totalRevenue: getTotalRevenueByChain(chain.id),
      estimatedSoldOutRevenue: getEstimatedSoldOutRevenueByChain(),
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
