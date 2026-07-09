import { NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/db';
import { getActivityFeedState } from '@/lib/activityFreshness';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activity
 * Returns recent tile activity events for the activity feed.
 * Sources from events_log table (all event types) or falls back to tiles table.
 */
export async function GET() {
  const events = getRecentActivity(50);
  const activityStatus = getActivityFeedState(events);

  return NextResponse.json({ events, activityStatus }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
