import { NextResponse } from 'next/server';
import { getPixelWarsLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/games/pixel-wars/leaderboard
 * Returns the active round info, paint counts per wallet, and current champion.
 * Query: ?limit=20
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const data = getPixelWarsLeaderboard(limit);
  return NextResponse.json(data);
}
