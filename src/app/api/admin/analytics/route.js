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
  getEngagementSummary,
  getActionBreakdown,
  getEmoteBreakdown,
  getDailyEngagement,
  getMostActiveAgents,
  getMostSlappedAgents,
  getConnectionStats,
  getHeartbeatStats,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 7), 90);

  const claimed = getClaimedCount();
  const totalRevenue = getTotalRevenue();
  const currentPrice = getCurrentPrice();
  const uniqueClaimers = getUniqueClaimerCount();

  const dailyStats = getDailyStats(days);
  const dailyUniqueClaimers = getDailyUniqueClaimers(days);
  const cumulativeRevenue = getCumulativeRevenue(days);

  const claimersByDate = Object.fromEntries(dailyUniqueClaimers.map(d => [d.date, d.uniqueClaimers]));
  const cumulativeByDate = Object.fromEntries(cumulativeRevenue.map(d => [d.date, d.cumulativeRevenue]));

  const timeline = dailyStats.map(d => ({
    date: d.date,
    claims: d.claims,
    revenue: d.revenue,
    uniqueClaimers: claimersByDate[d.date] || 0,
    cumulativeRevenue: cumulativeByDate[d.date] || null,
  }));

  // Engagement data
  const engagement = getEngagementSummary();
  const actionBreakdown = getActionBreakdown();
  const emoteBreakdown = getEmoteBreakdown();
  const dailyEngagement = getDailyEngagement(days);
  const mostActive = getMostActiveAgents(10);
  const mostSlapped = getMostSlappedAgents(5);
  const connectionStats = getConnectionStats();
  const heartbeatStats = getHeartbeatStats();

  return NextResponse.json({
    summary: {
      claimed,
      totalTiles: TOTAL_TILES,
      claimedPct: parseFloat(((claimed / TOTAL_TILES) * 100).toFixed(3)),
      totalRevenue: parseFloat(totalRevenue.toFixed(4)),
      currentPrice: parseFloat(currentPrice.toFixed(6)),
      uniqueClaimers,
    },
    engagement,
    actionBreakdown,
    emoteBreakdown,
    dailyEngagement,
    mostActive,
    mostSlapped,
    connectionStats,
    heartbeatStats,
    timeline,
    daysShown: days,
  });
}
