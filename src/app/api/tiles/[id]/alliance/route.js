import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getTileAlliance, TOTAL_TILES } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tiles/:id/alliance
 * Get tile's current alliance (if any).
 */
export async function GET(request, { params }) {
  const disabled = featureDisabled(FEATURES.ALLIANCES, 'Alliances');
  if (disabled) return disabled;

  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const alliance = getTileAlliance(tileId);
  return NextResponse.json({ alliance });
}
