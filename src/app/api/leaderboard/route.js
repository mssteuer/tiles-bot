import { NextResponse } from 'next/server';
import {
  getTopHoldersWithTiles,
  getOnlineCount,
  getRecentlyActive,
  getCategoryBreakdown,
  getClaimedCount,
  getTopViewedTiles,
  getTopByReputation,
  getChallengersLeaderboard,
  getPixelWarsLeaderboard,
  TOTAL_TILES,
  checkHeartbeats,
} from '@/lib/db';

export async function GET() {
  checkHeartbeats();

  const topHolders = getTopHoldersWithTiles(20);
  const onlineCount = getOnlineCount();
  const recentlyActive = getRecentlyActive(15);
  const categoryBreakdown = getCategoryBreakdown();
  const totalClaimed = getClaimedCount();
  const mostViewed = getTopViewedTiles(20);
  const topReputation = getTopByReputation(20);
  const topChallengers = getChallengersLeaderboard(20);
  const pixelWarsLeaders = getPixelWarsLeaderboard(20);

  return NextResponse.json({
    topHolders,
    onlineCount,
    recentlyActive,
    categoryBreakdown,
    totalClaimed,
    totalTiles: TOTAL_TILES,
    mostViewed,
    topReputation,
    topChallengers,
    pixelWarsLeaders,
  });
}
