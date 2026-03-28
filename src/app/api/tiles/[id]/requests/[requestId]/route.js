import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  getTile,
  getConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  TOTAL_TILES,
} from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

/**
 * POST /api/tiles/:id/requests/:requestId
 * Accept or reject a connection request.
 * Body: { action: 'accept' | 'reject' }
 * Auth: EIP-191 signature of "tiles.bot:connect:{toTileId}:{requestId}:{timestamp}"
 * The authenticated wallet must own the TO tile (the tile receiving the request).
 */
export async function POST(request, { params }) {
  const { id, requestId: reqIdStr } = await params;
  const tileId = parseInt(id, 10);
  const requestId = parseInt(reqIdStr, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }
  if (isNaN(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  if (!tile) {
    return NextResponse.json({ error: 'Tile not claimed' }, { status: 404 });
  }

  const connReq = getConnectionRequest(requestId);
  if (!connReq) {
    return NextResponse.json({ error: 'Connection request not found' }, { status: 404 });
  }
  if (connReq.toTileId !== tileId) {
    return NextResponse.json({ error: 'Request does not belong to this tile' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !['accept', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'Body must include action: "accept" or "reject"' }, { status: 400 });
  }

  // Wallet auth — verify the caller owns the TO tile
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSig = request.headers.get('X-Wallet-Signature');
  const walletMsg = request.headers.get('X-Wallet-Message');

  if (!walletAddress || !walletSig || !walletMsg) {
    return NextResponse.json(
      { error: 'Auth required (X-Wallet-Address, X-Wallet-Message, X-Wallet-Signature)' },
      { status: 401 }
    );
  }

  // Message format: tiles.bot:connect:{toTileId}:{requestId}:{timestamp}
  const msgParts = walletMsg.split(':');
  if (
    msgParts.length !== 5 ||
    msgParts[0] !== 'tiles.bot' ||
    msgParts[1] !== 'connect' ||
    msgParts[2] !== String(tileId) ||
    msgParts[3] !== String(requestId)
  ) {
    return NextResponse.json({ error: 'Invalid auth message format' }, { status: 401 });
  }

  const msgTs = parseInt(msgParts[4], 10);
  const nowTs = Math.floor(Date.now() / 1000);
  if (isNaN(msgTs) || Math.abs(nowTs - msgTs) > 600) {
    return NextResponse.json({ error: 'Auth signature expired (10-minute window)' }, { status: 401 });
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethers.verifyMessage(walletMsg, walletSig);
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Signer does not match claimed wallet address' }, { status: 401 });
  }

  // Ownership check: DB match OR on-chain ownerOf match (handles smart wallets)
  const isDbOwner = recoveredAddress.toLowerCase() === tile.owner.toLowerCase();
  if (!isDbOwner) {
    // On-chain check: the connected wallet (which signs) may be the smart wallet
    // that owns the NFT, while DB has a different address from the Transfer event
    try {
      const { createPublicClient, http, parseAbi } = await import('viem');
      const chains = await import('viem/chains');
      const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';
      const chain = chainId === '84532' ? chains.baseSepolia : chains.base;
      const publicClient = createPublicClient({
        chain,
        transport: http(chainId === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
      });
      const OWNER_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);
      const onChainOwner = await publicClient.readContract({
        address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
        abi: OWNER_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tileId)],
      });
      if (onChainOwner.toLowerCase() !== recoveredAddress.toLowerCase()) {
        return NextResponse.json({ error: 'Not tile owner (on-chain verification failed)' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Not tile owner (on-chain check unavailable)' }, { status: 403 });
    }
  }

  try {
    if (body.action === 'accept') {
      const result = acceptConnectionRequest(requestId, tileId);
      broadcast({ type: 'connection_accepted', fromTileId: result.fromTileId, toTileId: result.toTileId });
      return NextResponse.json({
        ok: true,
        action: 'accepted',
        fromTileId: result.fromTileId,
        toTileId: result.toTileId,
        message: `Connection request accepted — tiles #${result.fromTileId} and #${result.toTileId} are now connected`,
      });
    } else {
      const result = rejectConnectionRequest(requestId, tileId);
      return NextResponse.json({
        ok: true,
        action: 'rejected',
        fromTileId: result.fromTileId,
        toTileId: result.toTileId,
        message: `Connection request rejected`,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}
