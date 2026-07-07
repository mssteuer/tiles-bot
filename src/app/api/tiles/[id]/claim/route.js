import { NextResponse } from 'next/server';
import { withX402 } from 'x402-next';
import {
  getCurrentPrice,
  getNextAvailableTileId,
  getTile,
  TOTAL_TILES,
} from '@/lib/db';
import { logX402Failure } from '@/lib/structured-logger';
import { getChain } from '@/lib/chains';
import { createClient as createCasperClient } from '@/lib/casper-client';
import {
  csprToMotes,
  buildCasperPaymentRequirements,
  buildCasperClaimInstructions,
  verifyCasperPayment,
  settleCasperPayment,
} from '@/lib/casper-x402';
import { resolveBaseX402Config } from '@/lib/base-x402';

// Base x402 settlements go to the dedicated chain treasury wallet.
const baseX402Config = resolveBaseX402Config({ chainConfig: getChain('base') });
const PAY_TO_ADDRESS = baseX402Config.payToAddress;
const X402_NETWORK = baseX402Config.network;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot').replace(/\/$/, '');
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10);

/**
 * New agent-direct claim flow:
 *
 * 1. Agent calls POST /api/tiles/:id/claim → gets 402 with x402 payment challenge
 * 2. Agent pays x402 challenge (USDC to treasury, or wCSPR on Casper)
 * 3. Agent receives this response with on-chain instructions
 * 4. Agent calls the contract directly from their own wallet:
 *    a. approve payment token to contract
 *    b. claim(tileId) / batchClaim([tokenIds]) on Base or claim(token_id) on Casper
 * 5. Agent calls POST /api/tiles/:id/register with txHash to register in DB
 *
 * The server never touches the contract. The agent's wallet does everything on-chain.
 */

function getRequestedChain(request) {
  const queryChain = request.nextUrl?.searchParams?.get('chain');
  const headerChain = request.headers.get('x-chain') || request.headers.get('x-tiles-chain');
  return (queryChain || headerChain || 'base').trim().toLowerCase();
}

async function getTileId(params) {
  const { id } = await params;
  return parseInt(id, 10);
}

function validateTileId(tileId) {
  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }
  return null;
}

function rejectClaimedTile(tileId) {
  const existing = getTile(tileId);
  if (existing) {
    return NextResponse.json({ error: 'Tile already claimed', tile: existing }, { status: 409 });
  }
  return null;
}

function extractWalletFromPaymentHeader(paymentHeader) {
  if (!paymentHeader) return 'unknown';
  try {
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));
    return decoded?.payload?.authorization?.from || decoded?.from || 'unknown';
  } catch {
    return 'unknown';
  }
}

function logPaymentFailure({ tileId, wallet, status, error }) {
  logX402Failure({
    tileId: String(tileId),
    wallet,
    errorCode: String(status),
    errorMessage: error || `HTTP ${status}`,
  });
}

function casperPaymentRequired(paymentRequirements, error = 'Payment required') {
  return NextResponse.json({
    x402Version: paymentRequirements.x402Version,
    error,
    accepts: [paymentRequirements],
  }, { status: 402 });
}

async function buildCasperPaymentContext(request, tileId) {
  const chainConfig = getChain('casper');
  const client = createCasperClient({
    rpcUrl: chainConfig.rpcUrl,
    contractHash: chainConfig.nftContract,
    chainName: chainConfig.chainName,
  });
  const price = await client.getCurrentPrice();
  const priceInMotes = csprToMotes(price);
  const resource = `${SITE_URL}${request.nextUrl.pathname}?chain=casper`;
  const paymentRequirements = buildCasperPaymentRequirements({
    tileId,
    priceInMotes,
    chainConfig,
    resource,
  });

  return { chainConfig, price, priceInMotes, paymentRequirements };
}

async function casperClaimHandler(request, { tileId }) {
  const validationResponse = validateTileId(tileId) || rejectClaimedTile(tileId);
  if (validationResponse) return validationResponse;

  let context;
  try {
    context = await buildCasperPaymentContext(request, tileId);
  } catch (err) {
    return NextResponse.json({
      error: 'Casper payment requirements unavailable',
      detail: err.message,
    }, { status: 503 });
  }

  const { chainConfig, price, priceInMotes, paymentRequirements } = context;
  const paymentHeader = request.headers.get('x-payment') || '';
  const wallet = extractWalletFromPaymentHeader(paymentHeader);

  if (!paymentHeader) {
    const error = 'Missing x-payment header';
    logPaymentFailure({ tileId, wallet, status: 402, error });
    return casperPaymentRequired(paymentRequirements, error);
  }

  const verification = await verifyCasperPayment(paymentHeader, paymentRequirements);
  if (!verification.valid) {
    const error = verification.error || 'Invalid Casper x402 payment';
    logPaymentFailure({ tileId, wallet, status: 402, error });
    return casperPaymentRequired(paymentRequirements, error);
  }

  const settlement = await settleCasperPayment(paymentHeader, paymentRequirements);
  if (!settlement.settled) {
    const error = settlement.error || 'Casper x402 payment settlement failed';
    logPaymentFailure({ tileId, wallet, status: 402, error });
    return casperPaymentRequired(paymentRequirements, error);
  }

  const nextAvailable = getNextAvailableTileId();
  const instructions = buildCasperClaimInstructions({
    tileId,
    priceInMotes,
    chainConfig,
    siteUrl: SITE_URL,
  });

  return NextResponse.json({
    ok: true,
    chain: 'casper',
    message: 'Payment verified. Now mint the Casper NFT on-chain from your own wallet, then call /register.',
    tileId,
    onChainPrice: `${price.toFixed(6)} CSPR`,
    priceInMotes,
    payment: {
      verified: true,
      settled: true,
      txHash: settlement.txHash || null,
    },
    paymentRequirements,
    instructions,
    contractAddress: chainConfig.nftContract,
    wcsprAddress: chainConfig.paymentToken,
    caip2: chainConfig.caip2,
    nextAvailableTileId: nextAvailable,
  }, { status: 200 });
}

async function claimHandler(request, { params }) {
  const tileId = await getTileId(params);
  const validationResponse = validateTileId(tileId) || rejectClaimedTile(tileId);
  if (validationResponse) return validationResponse;

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
 * The x402 middleware rejects invalid Base payments before our handler is called;
 * Casper requests are handled directly because x402-next does not support Casper.
 */
export async function POST(request, context) {
  const pathname = request.nextUrl?.pathname || '';
  const tileIdMatch = pathname.match(/\/tiles\/(\d+)\//);
  const tileIdFromPath = tileIdMatch ? tileIdMatch[1] : 'unknown';
  const requestedChain = getRequestedChain(request);

  if (requestedChain === 'casper') {
    const tileId = await getTileId(context.params);
    return casperClaimHandler(request, { tileId });
  }

  if (requestedChain !== 'base') {
    return NextResponse.json({ error: `Unsupported chain: ${requestedChain}` }, { status: 400 });
  }

  const paymentHeader = request.headers.get('x-payment') || '';
  const wallet = extractWalletFromPaymentHeader(paymentHeader);
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
    logPaymentFailure({
      tileId: tileIdFromPath,
      wallet,
      status: response.status,
      error: errorMessage,
    });
  }

  return response;
}
