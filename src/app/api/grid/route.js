import { NextResponse } from 'next/server';
import {
  getGridState,
  getClaimedCount,
  getCurrentPrice,
  getTotalRevenue,
  getEstimatedSoldOutRevenue,
  getPendingRequestCounts,
  TOTAL_TILES,
  checkHeartbeats,
  getAllAllianceTileMap,
  getTilesWithOpenBounties,
  getPixelWarsMap,
  getPixelWarsChampionTiles,
  getActiveCtfFlag,
  getActiveTdInvasions,
  getPerChainStats,
} from '@/lib/db';
import { buildChainStatsPayload, getAllChainCurrentPrices } from '@/lib/chain-api';

export async function GET() {
  checkHeartbeats();
  const grid = getGridState();
  const chainStats = getPerChainStats();
  const chainPrices = await getAllChainCurrentPrices(chainStats);
  const perChain = buildChainStatsPayload(chainPrices, chainStats);
  const basePrice = perChain.base?.currentPrice ?? getCurrentPrice();

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
      currentPrice: basePrice,
      totalRevenue: getTotalRevenue(),
      estimatedSoldOutRevenue: getEstimatedSoldOutRevenue(),
      perChain,
    },
  });
}
