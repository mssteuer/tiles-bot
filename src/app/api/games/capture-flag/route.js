import { NextResponse } from 'next/server';
import { getCtfStats, getCtfWeeklyLeaderboard } from '@/lib/db';

export async function GET() {
  const stats = getCtfStats();
  const leaderboard = getCtfWeeklyLeaderboard();
  return NextResponse.json({ ...stats, leaderboard });
}
