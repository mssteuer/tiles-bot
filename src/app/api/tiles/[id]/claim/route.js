import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import {
  getCurrentPrice,
  getNextAvailableTileId,
  getTile,
  TOTAL_TILES,
} from '@/lib/db';
import { logX402Failure } from '@/lib/structured-logger';

// Treasury address that receives x402 USDC payments
const PAY_TO_ADDRESS = process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';
const X402_NETWORK = process.env.X402_NETWORK || 'base-sepolia';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot').replace(/\/$/, '');
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10);

/**
 * New agent-direct claim flow:
 * 
 * 1. Agent calls POST /api/tiles/:id/claim → gets 402 with x402 payment challenge
 * 2. Agent pays x402 challenge (USDC to treasury)
 * 3. Agent receives this response with on-chain instructions
 * 4. Agent calls the contract directly from their own wallet:
 *    a. approve USDC to contract
 *    b. claim(tileId) or batchClaim([tileIds])
 * 5. Agent calls POST /api/tiles/:id/register with txHash to register in DB
 * 
 * The server never touches the contract. The agent's wallet does everything on-chain.
 */
async function claimHandler(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  // Check if already claimed
  const existing = getTile(tileId);
  if (existing) {
    return NextResponse.json({ error: 'Tile already claimed', tile: existing }, { status: 409 });
  }

  const price = getCurrentPrice();
  const nextAvailable = getNextAvailableTileId();

  // Return on-chain instructions for the agent to execute directly
  return NextResponse.json({
    ok: true,
    message: 'Payment verified. Now mint the NFT on-chain from your own wallet, then call /register.',
    tileId,
    onChainPrice: `${(price).toFixed(6)} USDC`,
    instructions: {
      step1_approve: {
        description: 'Approve USDC spending (skip if already approved)',
        contract: USDC_ADDRESS,
        function: 'approve(address spender, uint256 amount)',
        args: { spender: CONTRACT_ADDRESS, amount: 'max uint256 or at least the tile price' },
        chainId: CHAIN_ID,
      },
      step2_claim: {
        description: 'Mint the tile NFT to your wallet',
        contract: CONTRACT_ADDRESS,
        function: 'claim(uint256 tokenId)',
        args: { tokenId: tileId },
        chainId: CHAIN_ID,
        note: 'For multiple tiles use: batchClaim(uint256[] tokenIds)',
      },
      step3_register: {
        description: 'Register the minted tile in the tiles.bot database',
        endpoint: `${SITE_URL}/api/tiles/${tileId}/register`,
        method: 'POST',
        body: { wallet: '<your-wallet-address>', txHash: '<claim-tx-hash>' },
        note: 'This verifies on-chain ownership and adds your tile to the grid.',
      },
    },
    contractAddress: CONTRACT_ADDRESS,
    usdcAddress: USDC_ADDRESS,
    chainId: CHAIN_ID,
    abi: {
      claim: 'function claim(uint256 tokenId) external',
      batchClaim: 'function batchClaim(uint256[] calldata tokenIds) external',
      approve: 'function approve(address spender, uint256 amount) returns (bool)',
    },
    nextAvailableTileId: nextAvailable,
  }, { status: 200 });
}

// Wrap with x402 — agent pays USDC to treasury, then gets the on-chain instructions
const x402Handler = withX402(
  claimHandler,
  PAY_TO_ADDRESS,
  async (request) => {
    const usdPrice = getCurrentPrice();
    const priceUsd = `$${usdPrice.toFixed(2)}`;
    const pathname = request.nextUrl.pathname;
    const resource = `${SITE_URL}${pathname}`;
    return {
      price: priceUsd,
      network: X402_NETWORK,
      config: {
        description: `Claim tile on tiles.bot (${priceUsd} USDC). After payment, you will mint the NFT on-chain from your own wallet.`,
        resource,
      },
    };
  }
);

/**
 * Wrap x402Handler to log failed payment attempts (4xx/5xx from x402 middleware).
 * The x402 middleware rejects invalid payments before our handler is called,
 * so we intercept the response here to detect those failures.
 */
export async function POST(request, context) {
  // Clone URL info before consuming the request (x402 may read it)
  const pathname = request.nextUrl?.pathname || '';
  // Extract tileId from URL
  const tileIdMatch = pathname.match(/\/tiles\/(\d+)\//);
  const tileId = tileIdMatch ? tileIdMatch[1] : 'unknown';

  // Extract wallet from X-PAYMENT header if present (public address only, no keys)
  const paymentHeader = request.headers.get('x-payment') || '';
  let wallet = 'unknown';
  try {
    if (paymentHeader) {
      const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));
      wallet = decoded?.payload?.authorization?.from || decoded?.from || 'unknown';
    }
  } catch {
    // ignore decode errors
  }

  const response = await x402Handler(request, context);

  // Log failures: 402 (payment required/invalid), 4xx (bad payment), 5xx (relay error)
  if (response.status === 402 || (response.status >= 400 && response.status < 600)) {
    let errorBody = {};
    try {
      errorBody = await response.clone().json();
    } catch {
      // ignore
    }
    const errorMessage = errorBody?.error || errorBody?.message || `HTTP ${response.status}`;
    logX402Failure({
      tileId,
      wallet,
      errorCode: String(response.status),
      errorMessage,
    });
  }

  return response;
}
