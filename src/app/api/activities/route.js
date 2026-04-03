import { NextResponse } from 'next/server';
import { getRecentActivity } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Supported stream values — currently only 'all' is meaningful (returns every event type)
const VALID_STREAMS = ['all'];

/**
 * GET /api/activities?limit=20&stream=all
 * Returns recent tile activity events for the live activity feed.
 * stream=all (default) returns all event types.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const stream = searchParams.get('stream') || 'all';

  if (!VALID_STREAMS.includes(stream)) {
    return NextResponse.json({ error: `Invalid stream "${stream}". Valid values: ${VALID_STREAMS.join(', ')}` }, { status: 400 });
  }

  const events = getRecentActivity(limit);

  return NextResponse.json({ events }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
