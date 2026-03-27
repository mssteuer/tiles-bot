import { NextResponse } from 'next/server';
import {
  getTopHoldersWithTiles,
  getOnlineCount,
  getRecentlyActive,
  getCategoryBreakdown,
  getClaimedCount,
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

  return NextResponse.json({
    topHolders,
    onlineCount,
    recentlyActive,
    categoryBreakdown,
    totalClaimed,
    totalTiles: TOTAL_TILES,
  });
}
