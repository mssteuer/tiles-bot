import { NextResponse } from 'next/server';
import { FEATURES, featureDisabled } from '@/lib/features';
import { captureCtfFlag, logEvent, TOTAL_TILES } from '@/lib/db';
import { verifyWalletSignature, verifyTileOwnership } from '@/lib/verify-wallet-sig';
import { broadcast } from '@/lib/sse-broadcast';

export async function POST(req) {
  const disabled = featureDisabled(FEATURES.CTF, 'CTF');
  if (disabled) return disabled;

  try {
    const body = await req.json();
    const wallet = body.wallet || req.headers.get('x-wallet') || req.headers.get('x-wallet-address');
    const walletSig = body.signature || req.headers.get('x-wallet-signature');
    const walletMsg = body.message || req.headers.get('x-wallet-message');
    const flagEventId = Number(body.flagEventId);
    const capturingTileId = Number(body.capturingTileId);

    if (!wallet) return NextResponse.json({ error: 'Wallet is required' }, { status: 400 });
    if (!Number.isInteger(flagEventId) || flagEventId <= 0) return NextResponse.json({ error: 'Invalid flagEventId' }, { status: 400 });
    if (!Number.isInteger(capturingTileId) || capturingTileId < 0 || capturingTileId >= TOTAL_TILES) return NextResponse.json({ error: 'Invalid capturingTileId' }, { status: 400 });
    if (!walletSig || !walletMsg) {
      return NextResponse.json({ error: 'Auth required (message + signature)' }, { status: 401 });
    }

    // Validate signed message format: tiles.bot:capture-flag:<flagEventId>:<capturingTileId>:<timestamp>
    const msgParts = walletMsg.split(':');
    if (msgParts.length !== 5 || msgParts[0] !== 'tiles.bot' || msgParts[1] !== 'capture-flag' ||
        msgParts[2] !== String(flagEventId) || msgParts[3] !== String(capturingTileId)) {
      return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
    }
    const msgTs = parseInt(msgParts[4], 10);
    const nowTs = Math.floor(Date.now() / 1000);
    if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
      return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
    }

    const sigValid = await verifyWalletSignature(walletMsg, walletSig, wallet).catch(() => false);
    if (!sigValid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    const isOwner = await verifyTileOwnership(capturingTileId, wallet);
    if (!isOwner) {
      return NextResponse.json({ error: 'Not tile owner' }, { status: 403 });
    }

    const captured = captureCtfFlag(flagEventId, capturingTileId, wallet);

    logEvent('ctf_captured', captured.flag_tile_id, wallet, {
      flagTileId: captured.flag_tile_id,
      capturingTileId: captured.captured_by_tile,
      summary: `[Tile #${captured.captured_by_tile}] captured the flag! 🚩`,
    });

    // Broadcast SSE so all clients update the grid immediately
    broadcast({ type: 'ctf_flag_captured', flagTileId: captured.flag_tile_id, capturingTileId: captured.captured_by_tile, ctfFlag: null });

    return NextResponse.json({ ok: true, captured });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to capture flag' }, { status: 400 });
  }
}
