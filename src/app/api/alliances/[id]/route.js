import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getAlliance } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/alliances/:id
 * Alliance detail: members, territory tiles, leaderboard rank.
 */
export async function GET(request, { params }) {
  const disabled = featureDisabled(FEATURES.ALLIANCES, 'Alliances');
  if (disabled) return disabled;

  const { id } = await params;
  const allianceId = parseInt(id, 10);
  if (isNaN(allianceId)) {
    return NextResponse.json({ error: 'Invalid alliance ID' }, { status: 400 });
  }

  const alliance = getAlliance(allianceId);
  if (!alliance) {
    return NextResponse.json({ error: 'Alliance not found' }, { status: 404 });
  }

  return NextResponse.json({ alliance });
}
