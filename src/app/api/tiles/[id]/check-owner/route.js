import { NextResponse } from 'next/server';
import { TOTAL_TILES } from '@/lib/db';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

/**
 * GET /api/tiles/:id/check-owner?wallet=0x...
 * 
 * Returns whether the given wallet is the on-chain owner of this tile.
 * Handles smart wallets: wagmi's useAccount returns the smart wallet address,
 * which IS the ownerOf() result on-chain.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const wallet = new URL(request.url).searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param required' }, { status: 400 });
  }

  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ isOwner: false }, { status: 200 });
  }

  try {
    const { createPublicClient, http, parseAbi } = await import('viem');
    const chains = await import('viem/chains');
    const chain = CHAIN_ID === '84532' ? chains.baseSepolia : chains.base;
    const publicClient = createPublicClient({
      chain,
      transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
    });

    const OWNER_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);
    const onChainOwner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: OWNER_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tileId)],
    });

    const isOwner = onChainOwner.toLowerCase() === wallet.toLowerCase();
    return NextResponse.json({ isOwner, onChainOwner }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // ownerOf reverts for unminted tiles
    return NextResponse.json({ isOwner: false }, { status: 200 });
  }
}
