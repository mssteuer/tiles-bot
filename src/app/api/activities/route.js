import { NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/activities?limit=20&stream=all
 * Returns recent tile activity events for the live activity feed.
 * stream=all returns all event types (default behavior).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const events = getRecentActivity(limit);

  return NextResponse.json({ events }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
