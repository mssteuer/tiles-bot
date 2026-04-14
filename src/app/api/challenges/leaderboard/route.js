import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getChallengersLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/challenges/leaderboard
 * Returns the challenge winners leaderboard.
 * Query: ?limit=20
 */
export async function GET(request) {
  const disabled = featureDisabled(FEATURES.CHALLENGES, 'Challenges');
  if (disabled) return disabled;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const leaderboard = getChallengersLeaderboard(limit);
  return NextResponse.json({ leaderboard });
}
