import { NextResponse } from 'next/server';
import { submitBountyAnswer, logEvent } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tiles/:id/bounties/:bountyId/submit
 * Submit an answer to a bounty.
 * Body: { tile_id (submitter), answer_text, url, wallet }
 */
export async function POST(request, { params }) {
  const { bountyId } = await params;
  const bId = parseInt(bountyId, 10);
  if (isNaN(bId)) {
    return NextResponse.json({ error: 'Invalid bounty ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tile_id, answer_text, url, wallet } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  const submitterTileId = parseInt(tile_id, 10);
  if (isNaN(submitterTileId)) return NextResponse.json({ error: 'Invalid tile_id' }, { status: 400 });
  if (!answer_text && !url) return NextResponse.json({ error: 'answer_text or url required' }, { status: 400 });

  try {
    const bounty = submitBountyAnswer(bId, submitterTileId, { answer_text, url, wallet });
    logEvent('bounty_submitted', submitterTileId, wallet, { bountyId: bId });
    try {
      broadcast({ type: 'bounty_submitted', bountyId: bId, submitterTileId, wallet });
    } catch {}
    return NextResponse.json({ ok: true, bounty });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to submit' }, { status: 400 });
  }
}
