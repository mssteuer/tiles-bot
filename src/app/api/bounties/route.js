import { NextResponse } from 'next/server';
import { getGlobalBounties } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bounties
 * Global bounty board — all open bounties sorted by reward.
 * Query: ?status=open&limit=50
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'open';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const bounties = getGlobalBounties({ status, limit });
  return NextResponse.json({ bounties });
}
