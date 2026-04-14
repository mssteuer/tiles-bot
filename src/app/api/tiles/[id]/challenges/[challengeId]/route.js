import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import {
  acceptChallenge,
  submitChallengeScore,
  getChallenge,
  getChallengeVotes,
  voteChallengeWinner,
  TOTAL_TILES,
  logEvent,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tiles/:id/challenges/:challengeId
 * Returns a single challenge with full details and community vote tallies.
 */
export async function GET(request, { params }) {

  const disabled = featureDisabled(FEATURES.TILE_CHALLENGES, 'Tile Challenges');
  if (disabled) return disabled;
  const { id, challengeId } = await params;
  const tileId = parseInt(id, 10);
  const chId = parseInt(challengeId, 10);

  if (isNaN(tileId) || isNaN(chId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const challenge = getChallenge(chId);
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  if (challenge.challenger_id !== tileId && challenge.defender_id !== tileId) {
    return NextResponse.json({ error: 'Tile is not a participant in this challenge' }, { status: 403 });
  }

  const votes = getChallengeVotes(chId);
  return NextResponse.json({ challenge, votes });
}

/**
 * PATCH /api/tiles/:id/challenges/:challengeId
 * Actions: accept | submit | vote
 * Body: { action, wallet, score?, votedForId? }
 */
export async function PATCH(request, { params }) {
  const disabled = featureDisabled(FEATURES.TILE_CHALLENGES, 'Tile Challenges');
  if (disabled) return disabled;
  const { id, challengeId } = await params;
  const tileId = parseInt(id, 10);
  const chId = parseInt(challengeId, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, wallet, score, votedForId } = body;

  if (!wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 401 });
  }

  if (action === 'accept') {
    try {
      const challenge = acceptChallenge(chId, wallet);
      logEvent('challenge_accepted', tileId, wallet, { challengeId: chId });
      try {
        broadcast({ type: 'challenge_accepted', challengeId: chId, defenderId: tileId });
      } catch {}
      return NextResponse.json({ ok: true, challenge });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  if (action === 'submit') {
    if (typeof score !== 'number') {
      return NextResponse.json({ error: 'score (number 0-100) is required for submit action' }, { status: 400 });
    }
    try {
      const challenge = submitChallengeScore(chId, tileId, wallet, score);
      logEvent('challenge_score_submitted', tileId, wallet, { challengeId: chId, score });
      if (challenge.status === 'completed') {
        logEvent('challenge_completed', challenge.winner_id ?? tileId, wallet, {
          challengeId: chId,
          winnerId: challenge.winner_id,
          challengerScore: challenge.challenger_score,
          defenderScore: challenge.defender_score,
        });
        try {
          broadcast({
            type: 'challenge_completed',
            challengeId: chId,
            winnerId: challenge.winner_id,
            challengerId: challenge.challenger_id,
            defenderId: challenge.defender_id,
            challengerScore: challenge.challenger_score,
            defenderScore: challenge.defender_score,
          });
        } catch {}
      }
      return NextResponse.json({ ok: true, challenge });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  if (action === 'vote') {
    const votedForTileId = parseInt(votedForId, 10);
    if (isNaN(votedForTileId)) {
      return NextResponse.json({ error: 'votedForId (tile ID) is required for vote action' }, { status: 400 });
    }
    try {
      const tally = voteChallengeWinner(chId, wallet, votedForTileId);
      logEvent('challenge_vote_cast', tileId, wallet, { challengeId: chId, votedForId: votedForTileId });
      try {
        broadcast({ type: 'challenge_vote_cast', challengeId: chId, votedForId: votedForTileId, tally });
      } catch {}
      return NextResponse.json({ ok: true, tally });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Invalid action. Use: accept | submit | vote' }, { status: 400 });
}
