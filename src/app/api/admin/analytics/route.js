import { NextResponse } from 'next/server';
import {
  getClaimedCount,
  getTotalRevenue,
  getEstimatedSoldOutRevenue,
  getCurrentPrice,
  TOTAL_TILES,
  getDailyStats,
  getDailyUniqueClaimers,
  getUniqueClaimerCount,
  getAveragePricePaid,
  getCumulativeRevenue,
  getRevenueByCategory,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 7), 90);

  const claimed = getClaimedCount();
  const totalRevenue = getTotalRevenue();
  const estimatedSoldOutRevenue = getEstimatedSoldOutRevenue();
  const currentPrice = getCurrentPrice();
  const uniqueClaimers = getUniqueClaimerCount();
  const avgPrice = getAveragePricePaid();

  const dailyStats = getDailyStats(days);
  const dailyUniqueClaimers = getDailyUniqueClaimers(days);
  const cumulativeRevenue = getCumulativeRevenue(days);
  const revenueByCategory = getRevenueByCategory();

  // Merge daily stats with unique claimers by date
  const claimersByDate = Object.fromEntries(dailyUniqueClaimers.map(d => [d.date, d.uniqueClaimers]));
  const cumulativeByDate = Object.fromEntries(cumulativeRevenue.map(d => [d.date, d.cumulativeRevenue]));

  const timeline = dailyStats.map(d => ({
    date: d.date,
    claims: d.claims,
    revenue: d.revenue,
    uniqueClaimers: claimersByDate[d.date] || 0,
    cumulativeRevenue: cumulativeByDate[d.date] || null,
  }));

  return NextResponse.json({
    summary: {
      claimed,
      available: TOTAL_TILES - claimed,
      totalTiles: TOTAL_TILES,
      claimedPct: parseFloat(((claimed / TOTAL_TILES) * 100).toFixed(3)),
      totalRevenue: parseFloat(totalRevenue.toFixed(4)),
      estimatedSoldOutRevenue: parseFloat(estimatedSoldOutRevenue.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(6)),
      uniqueClaimers,
      avgPricePaid: avgPrice,
      revenueProgressPct: parseFloat(((totalRevenue / estimatedSoldOutRevenue) * 100).toFixed(4)),
    },
    timeline,
    revenueByCategory,
    daysShown: days,
  });
}
