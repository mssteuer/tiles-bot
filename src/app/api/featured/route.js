import { NextResponse } from 'next/server';
import { getActiveFeaturedTiles } from '@/lib/db';

/**
 * GET /api/featured
 * Returns currently active spotlight tiles.
 */
export async function GET() {
  try {
    const featured = getActiveFeaturedTiles(8);
    return NextResponse.json({ featured });
  } catch (err) {
    console.error('[featured] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
