import { NextResponse } from 'next/server';
import { getChallengersLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/challenges
 * Returns the challenge winners leaderboard.
 * Query: ?limit=20
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const leaderboard = getChallengersLeaderboard(limit);
  return NextResponse.json({ leaderboard });
}
