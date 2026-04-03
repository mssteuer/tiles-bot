import { NextResponse } from 'next/server';
import { getBounty } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tiles/:id/bounties/:bountyId
 * Get bounty detail with all submissions.
 */
export async function GET(request, { params }) {
  const { bountyId } = await params;
  const id = parseInt(bountyId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bounty ID' }, { status: 400 });
  }
  const bounty = getBounty(id);
  if (!bounty) {
    return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
  }
  return NextResponse.json({ bounty });
}
