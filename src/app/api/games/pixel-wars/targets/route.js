import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { getPixelWarsTargets } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/games/pixel-wars/targets?wallet=0x...
 * Returns unclaimed tiles adjacent to any tile owned by the given wallet.
 */
export async function GET(request) {
  const disabled = featureDisabled(FEATURES.PIXEL_WARS, 'Pixel Wars');
  if (disabled) return disabled;
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'wallet param required' }, { status: 400 });
  }

  const targets = getPixelWarsTargets(wallet);
  return NextResponse.json({ targets });
}
