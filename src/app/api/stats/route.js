import { NextResponse } from 'next/server';
import {
  getClaimedCount,
  getCurrentPrice,
  TOTAL_TILES,
  getNextAvailableTileId,
  getRecentlyClaimed,
  getTopHolders,
  getEstimatedSoldOutRevenue,
  getTotalRevenue,
  getPerChainStats,
} from '@/lib/db';
import { buildChainStatsPayload, getAllChainCurrentPrices } from '@/lib/chain-api';

export async function GET() {
  const claimed = getClaimedCount();
  const recentlyClaimed = getRecentlyClaimed(10).map(row => ({
    id: row.id,
    name: row.name || `Tile #${row.id}`,
    owner: row.owner,
    claimedAt: row.claimed_at,
    chain: row.chain || 'base',
  }));
  const topHolders = getTopHolders(10).map(row => ({
    owner: row.owner,
    count: row.count,
  }));

  const chainStats = getPerChainStats();
  const chainPrices = await getAllChainCurrentPrices(chainStats);
  const perChain = buildChainStatsPayload(chainPrices, chainStats);
  const basePrice = perChain.base?.currentPrice ?? getCurrentPrice();

  return NextResponse.json({
    claimed,
    available: TOTAL_TILES - claimed,
    total: TOTAL_TILES,
    currentPrice: basePrice,
    nextAvailableTileId: getNextAvailableTileId(),
    floorPrice: null,
    totalRevenue: getTotalRevenue(),
    estimatedSoldOutRevenue: getEstimatedSoldOutRevenue(),
    recentlyClaimed,
    topHolders,
    perChain,
  });
}
