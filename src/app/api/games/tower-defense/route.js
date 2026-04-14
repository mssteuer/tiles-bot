import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getTdStats, getTdLeaderboard, getActiveTdInvasions } from '@/lib/db';

export async function GET() {
  const disabled = featureDisabled(FEATURES.TOWER_DEFENSE, 'Tower Defense');
  if (disabled) return disabled;
  const stats = getTdStats();
  const leaderboard = getTdLeaderboard();
  const active = getActiveTdInvasions();
  return NextResponse.json({ stats, leaderboard, active });
}
