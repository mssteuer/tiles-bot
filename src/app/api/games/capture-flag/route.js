import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getCtfStats, getCtfWeeklyLeaderboard } from '@/lib/db';

export async function GET() {
  const disabled = featureDisabled(FEATURES.CTF, 'CTF');
  if (disabled) return disabled;

  const stats = getCtfStats();
  const leaderboard = getCtfWeeklyLeaderboard();
  return NextResponse.json({ ...stats, leaderboard });
}
