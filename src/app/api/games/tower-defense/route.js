import { NextResponse } from 'next/server';
import { getTdStats, getTdLeaderboard, getActiveTdInvasions } from '@/lib/db';

export async function GET() {
  const stats = getTdStats();
  const leaderboard = getTdLeaderboard();
  const active = getActiveTdInvasions();
  return NextResponse.json({ stats, leaderboard, active });
}
