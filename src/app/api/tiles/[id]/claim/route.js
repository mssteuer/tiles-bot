import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import { claimTile, getCurrentPrice, setTileTxHash, unclaimTile, TOTAL_TILES } from '@/lib/db';
import { broadcast } from '@/lib/sse-broadcast';

// Treasury address that receives USDC payments (set in env or default to placeholder)
const PAY_TO_ADDRESS = process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';

// Network: 'base' for mainnet, 'base-sepolia' for testnet
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';

/**
 * Call the on-chain claim() function using the server wallet.
 * Returns the tx hash, or null if SERVER_WALLET_PRIVATE_KEY is not configured.
 * Throws if the contract call fails (e.g. tile already claimed on-chain → 409).
 */
async function callOnChainClaim(tileId) {
  if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
    console.warn(
      '[claim] SERVER_WALLET_PRIVATE_KEY not set — skipping on-chain contract call. ' +
      'Set this env var to enable full end-to-end minting.'
    );
    return null;
  }

  const { createWalletClient, http, parseAbi } = await import('viem');
  const { base } = await import('viem/chains');
  const { privateKeyToAccount } = await import('viem/accounts');

  const CLAIM_ABI = parseAbi(['function claim(uint256 tokenId) external']);
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.warn('[claim] NEXT_PUBLIC_CONTRACT_ADDRESS not set — skipping on-chain call.');
    return null;
  }

  const account = privateKeyToAccount(process.env.SERVER_WALLET_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  const txHash = await walletClient.writeContract({
    address: contractAddress,
    abi: CLAIM_ABI,
    functionName: 'claim',
    args: [BigInt(tileId)],
  });

  return txHash;
}

async function claimHandler(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.wallet) {
    return NextResponse.json({ error: 'wallet address required' }, { status: 400 });
  }

  const price = getCurrentPrice();

  // Insert tile into DB first (idempotency check)
  const tile = claimTile(tileId, body.wallet, price);
  if (!tile) {
    return NextResponse.json({ error: 'Tile already claimed or invalid' }, { status: 409 });
  }

  // Call the smart contract to actually mint the NFT on-chain
  let txHash = null;
  try {
    txHash = await callOnChainClaim(tileId);
  } catch (err) {
    // Roll back the DB entry — tile must be re-claimable after a failed on-chain tx
    unclaimTile(tileId);

    const msg = err?.message || '';
    if (
      msg.includes('already claimed') ||
      msg.includes('AlreadyClaimed') ||
      msg.includes('ERC721: token already minted') ||
      msg.includes('revert')
    ) {
      console.error(`[claim] Contract revert for tile #${tileId}:`, msg);
      return NextResponse.json(
        { error: 'Tile already claimed on-chain', detail: msg },
        { status: 409 }
      );
    }
    // For other contract errors (gas, network, etc.), surface as 500
    console.error(`[claim] On-chain claim failed for tile #${tileId}:`, err);
    return NextResponse.json(
      { error: 'On-chain claim transaction failed', detail: msg },
      { status: 500 }
    );
  }

  // Persist txHash into DB
  if (txHash) {
    setTileTxHash(tileId, txHash);
    tile.txHash = txHash;
  }

  // Broadcast real-time update to all connected SSE clients
  broadcast({ type: 'tile_claimed', tileId, tile });

  return NextResponse.json({ tile, pricePaid: price, txHash }, { status: 201 });
}

// Wrap with x402 payment verification using dynamic pricing from bonding curve.
// withX402 will:
//   1. If no X-PAYMENT header: return 402 with payment requirements (amount + recipient)
//   2. If X-PAYMENT header present: verify USDC payment via x402 facilitator
//   3. Only call claimHandler if payment is valid; settle payment after 200 response
//
// Price is fetched dynamically from getCurrentPrice() (exponential bonding curve:
// starts at ~$0.01 USDC, asymptotes toward $111 as all 65,536 tiles are claimed).
export const POST = withX402(
  claimHandler,
  PAY_TO_ADDRESS,
  async () => {
    const usdPrice = getCurrentPrice();
    // Format as USD string with 2 decimal places (x402 accepts "$1.23" format)
    const priceUsd = `$${usdPrice.toFixed(2)}`;
    return {
      price: priceUsd,
      network: X402_NETWORK,
      config: {
        description: `Claim a MillionBotHomepage tile (bonding curve price: ${priceUsd} USDC)`,
      },
    };
  }
);
