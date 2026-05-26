import { NextResponse } from 'next/server';
import { getClaimedCount, getCurrentPrice, TOTAL_TILES, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, getEstimatedSoldOutRevenue, getTotalRevenue, getPerChainStats } from '@/lib/db';
import { getSupportedChains } from '@/lib/chains';

export async function GET() {
  const claimed = getClaimedCount();
  const recentlyClaimed = getRecentlyClaimed(10).map(row => ({
    id: row.id,
    name: row.name || `Tile #${row.id}`,
    owner: row.owner,
    claimedAt: row.claimed_at,
  }));
  const topHolders = getTopHolders(10).map(row => ({
    owner: row.owner,
    count: row.count,
  }));

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
    claimed,
    available: TOTAL_TILES - claimed,
    total: TOTAL_TILES,
    currentPrice: getCurrentPrice(),
    nextAvailableTileId: getNextAvailableTileId(),
    // TODO: floor price from secondary market (OpenSea/Reservoir API)
    floorPrice: null,
    totalRevenue: getTotalRevenue(),
    estimatedSoldOutRevenue: getEstimatedSoldOutRevenue(),
    recentlyClaimed,
    topHolders,
    perChain,
  });
}
