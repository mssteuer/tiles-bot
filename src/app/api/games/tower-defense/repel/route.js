import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { repelTdInvader, logEvent, TOTAL_TILES } from '@/lib/db';
import { verifyWalletSignature, verifyTileOwnership } from '@/lib/verify-wallet-sig';
import { broadcast } from '@/lib/sse-broadcast';

export async function POST(req) {
  const disabled = featureDisabled(FEATURES.TOWER_DEFENSE, 'Tower Defense');
  if (disabled) return disabled;

  try {
    const body = await req.json();
    const wallet = body.wallet || req.headers.get('x-wallet') || req.headers.get('x-wallet-address');
    const walletSig = body.signature || req.headers.get('x-wallet-signature');
    const walletMsg = body.message || req.headers.get('x-wallet-message');
    const invasionId = Number(body.invasionId);
    const defenderTileId = Number(body.defenderTileId);

    if (!wallet) return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
    if (!Number.isInteger(invasionId) || invasionId <= 0) return NextResponse.json({ error: 'Invalid invasionId' }, { status: 400 });
    if (!Number.isInteger(defenderTileId) || defenderTileId < 0 || defenderTileId >= TOTAL_TILES) {
      return NextResponse.json({ error: 'Invalid defenderTileId' }, { status: 400 });
    }
    if (!walletSig || !walletMsg) {
      return NextResponse.json({ error: 'Auth required (message + signature)' }, { status: 401 });
    }

    // Validate signed message format: tiles.bot:tower-defense:repel:<invasionId>:<defenderTileId>:<timestamp>
    const msgParts = walletMsg.split(':');
    if (
      msgParts.length !== 6 ||
      msgParts[0] !== 'tiles.bot' ||
      msgParts[1] !== 'tower-defense' ||
      msgParts[2] !== 'repel' ||
      msgParts[3] !== String(invasionId) ||
      msgParts[4] !== String(defenderTileId)
    ) {
      return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
    }
    const msgTs = parseInt(msgParts[5], 10);
    const nowTs = Math.floor(Date.now() / 1000);
    if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
      return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
    }

    const sigValid = await verifyWalletSignature(walletMsg, walletSig, wallet).catch(() => false);
    if (!sigValid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    const isOwner = await verifyTileOwnership(defenderTileId, wallet);
    if (!isOwner) {
      return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
    }

    const invasion = repelTdInvader(invasionId, defenderTileId, wallet);

    // Broadcast so all clients remove the red glow immediately
    broadcast({
      type: 'td_repelled',
      invasionId: invasion.id,
      tileId: invasion.tile_id,
      defenderTileId,
      repelledBy: wallet,
    });

    return NextResponse.json({ ok: true, invasion });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to repel invader' }, { status: 400 });
  }
}
