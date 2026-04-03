import { NextResponse } from 'next/server';
import {
  issueChallenge,
  getTileChallenges,
  VALID_TASK_TYPES,
  TOTAL_TILES,
  logEvent,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tiles/:id/challenges
 * Returns active and recent challenges for a tile (as challenger or defender).
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const challenges = getTileChallenges(tileId, 20);
  return NextResponse.json({ challenges });
}

/**
 * POST /api/tiles/:id/challenges
 * Issue a challenge from tile :id to another tile.
 * Body: { targetId, taskType?, message?, wallet }
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const challengerId = parseInt(id, 10);
  if (isNaN(challengerId) || challengerId < 0 || challengerId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { targetId, taskType = 'general', message, wallet } = body;
  if (!wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  }

  const defenderId = parseInt(targetId, 10);
  if (isNaN(defenderId) || defenderId < 0 || defenderId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid target tile ID' }, { status: 400 });
  }

  if (!VALID_TASK_TYPES.includes(taskType)) {
    return NextResponse.json({ error: `Invalid task type. Valid: ${VALID_TASK_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    const challengeId = issueChallenge(challengerId, defenderId, wallet, taskType, message);

    // Log to events and broadcast
    logEvent('challenge_issued', challengerId, wallet, { targetId: defenderId, taskType, challengeId });
    try {
      broadcast({
        type: 'challenge_issued',
        challengeId,
        challengerId,
        defenderId,
        taskType,
        message,
        wallet,
      });
    } catch {}

    return NextResponse.json({ ok: true, challengeId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to issue challenge' }, { status: 400 });
  }
}
