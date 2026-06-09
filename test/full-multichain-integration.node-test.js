/**
 * Full multi-chain integration suite.
 *
 * This intentionally stays in node:test with mocked route boundaries: the goal is
 * to prove chain selection, DB state, payment routing, and agent-facing tooling
 * without requiring live Base Sepolia/Casper Testnet credentials in CI.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

// — Chain env loaded before requiring chain-aware modules
process.env.CHAIN_BASE_NFT_CONTRACT = '0xB2915C42329edFfC26037eed300D620C302b5791';
process.env.CHAIN_BASE_PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.CHAIN_BASE_TREASURY = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.CHAIN_BASE_RPC_URL = 'https://sepolia.base.example/rpc';
process.env.CHAIN_BASE_EXPLORER = 'https://sepolia.basescan.org';
process.env.CHAIN_BASE_X402_FACILITATOR = 'https://x402.base.example';
process.env.NEXT_PUBLIC_CONTRACT_ADDRESS = '0xB2915C42329edFfC26037eed300D620C302b5791';
process.env.NEXT_PUBLIC_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
process.env.X402_PAY_TO_ADDRESS = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';
process.env.X402_NETWORK = 'base-sepolia';
process.env.CHAIN_CASPER_NFT_CONTRACT = 'hash-casper-nft';
process.env.CHAIN_CASPER_PAYMENT_TOKEN = 'hash-wcspr-token';
process.env.CHAIN_CASPER_TREASURY = '01' + 'a'.repeat(64);
process.env.CHAIN_CASPER_RPC_URL = 'https://node.testnet.casper.example/rpc';
process.env.CHAIN_CASPER_EXPLORER = 'https://testnet.cspr.live';
process.env.CHAIN_CASPER_X402_FACILITATOR = 'https://x402.casper.example';
process.env.DEFAULT_CHAIN = 'base';

const ROOT = path.join(__dirname, '..');

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function requestFor(url, body = {}, headers = {}) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    async json() {
      return body;
    },
  };
}

function loadBatchClaimRoute(overrides = {}) {
  const calls = {
    claimTile: [],
    currentPrice: [],
    currentPriceByChain: [],
  };
  const chainConfigs = {
    base: { id: 'base', name: 'Base', nftContract: '0xbase-nft' },
    casper: { id: 'casper', name: 'Casper', nftContract: 'hash-casper-nft' },
  };
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      TOTAL_TILES: 65536,
      getClaimedCount: () => 3,
      getCurrentPrice: () => {
        calls.currentPrice.push('base-legacy');
        return 0.01;
      },
      getCurrentPriceByChain: (chainId) => {
        calls.currentPriceByChain.push(chainId);
        return chainId === 'casper' ? 0.02 : 0.03;
      },
      claimTile: (id, wallet, pricePaid, chain = 'base', chainContract = null) => {
        calls.claimTile.push({ id, wallet, pricePaid, chain, chainContract });
        if (id === 9) return null;
        return { id, owner: wallet, pricePaid, chain, chainContract };
      },
    },
    chainApi: {
      resolveRequestedChainId(request, body) {
        return (body?.chain || request?.nextUrl?.searchParams?.get('chain') || 'base').trim().toLowerCase();
      },
      assertSupportedChain(chainId) {
        const chain = chainConfigs[chainId];
        if (!chain) throw new Error(`Unknown chain: ${chainId}`);
        return chain;
      },
    },
    ...overrides,
  };

  let source = fs.readFileSync(path.join(ROOT, 'src/app/api/tiles/batch-claim/route.js'), 'utf8');
  // Keep the import-shape variants next to the import-leak guard below. If the
  // route import changes, the guard turns that maintenance debt into a loud test failure.
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPrice } from '@/lib/db';", 'const { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPrice, getCurrentPriceByChain } = __mocks.db;')
    .replace("import { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPriceByChain } from '@/lib/db';", 'const { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPrice, getCurrentPriceByChain } = __mocks.db;')
    .replace(/import \{\n  claimTile,\n  getClaimedCount,\n  TOTAL_TILES,\n  getCurrentPrice,\n  getCurrentPriceByChain,\n\} from '@\/lib\/db';/, 'const { claimTile, getClaimedCount, TOTAL_TILES, getCurrentPrice, getCurrentPriceByChain } = __mocks.db;')
    .replace("import { assertSupportedChain, resolveRequestedChainId } from '@/lib/chain-api';", 'const { assertSupportedChain, resolveRequestedChainId } = __mocks.chainApi;')
    .replace('export async function POST(request) {', 'async function POST(request) {');

  if (/^import |^export /m.test(source)) {
    throw new Error('Batch-claim route mocks failed to replace all imports/exports');
  }

  const context = { __mocks: mocks, module: { exports: {} }, Response, Headers, URL, console };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, {
    filename: path.join(ROOT, 'src/app/api/tiles/batch-claim/route.js'),
  });
  return { POST: context.module.exports.POST, calls };
}

function loadHeartbeatRoute(overrides = {}) {
  const calls = { logEvent: [] };
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      TOTAL_TILES: 65536,
      heartbeat: (tileId, wallet) => ({
        id: tileId,
        owner: wallet,
        name: `Tile #${tileId}`,
        avatar: null,
        chain: 'casper',
      }),
      logEvent: (...args) => calls.logEvent.push(args),
    },
    chainApi: {
      resolveRequestedChainId(request, body) {
        return (body?.chain || request?.nextUrl?.searchParams?.get('chain') || 'base').trim().toLowerCase();
      },
      assertSupportedChain(chainId) {
        if (!['base', 'casper'].includes(chainId)) throw new Error(`Unknown chain: ${chainId}`);
        return { id: chainId };
      },
    },
    ...overrides,
  };

  let source = fs.readFileSync(path.join(ROOT, 'src/app/api/tiles/[id]/heartbeat/route.js'), 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { heartbeat, logEvent, TOTAL_TILES } from '@/lib/db';", 'const { heartbeat, logEvent, TOTAL_TILES } = __mocks.db;')
    .replace("import { assertSupportedChain, resolveRequestedChainId } from '@/lib/chain-api';", 'const { assertSupportedChain, resolveRequestedChainId } = __mocks.chainApi;')
    .replace('export async function POST(request, { params }) {', 'async function POST(request, { params }) {');

  if (/^import |^export /m.test(source)) {
    throw new Error('Heartbeat route mocks failed to replace all imports/exports');
  }

  const context = { __mocks: mocks, module: { exports: {} }, Response, Headers, URL, console };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, {
    filename: path.join(ROOT, 'src/app/api/tiles/[id]/heartbeat/route.js'),
  });
  return { POST: context.module.exports.POST, calls };
}

function paymentHeaderFor(wallet) {
  return Buffer.from(JSON.stringify({
    payload: { authorization: { from: wallet } },
  })).toString('base64');
}

function loadClaimRoute(overrides = {}) {
  const calls = {
    baseRequirements: [],
    baseVerify: [],
    baseSettle: [],
    createClient: [],
    buildCasperRequirements: [],
    casperVerify: [],
    casperSettle: [],
    buildCasperInstructions: [],
    logs: [],
  };
  const casperConfig = {
    id: 'casper',
    caip2: 'casper:casper',
    chainName: 'casper-test',
    name: 'Casper',
    nftContract: 'hash-casper-nft',
    paymentToken: 'hash-wcspr-token',
    treasury: '01' + 'a'.repeat(64),
    rpcUrl: 'https://node.testnet.casper.example/rpc',
    explorer: 'https://testnet.cspr.live',
    x402Facilitator: 'https://x402.casper.example',
  };
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    x402Next: {
      withX402(handler, payTo, requirementsFactory) {
        return async (request, context) => {
          const requirements = await requirementsFactory(request);
          calls.baseRequirements.push({ payTo, requirements });
          const paymentHeader = request.headers.get('x-payment') || '';
          if (!paymentHeader) {
            return jsonResponse({ x402Version: 1, error: 'Payment required', accepts: [requirements] }, { status: 402 });
          }

          calls.baseVerify.push({ paymentHeader, requirements });
          calls.baseSettle.push({ paymentHeader, requirements, txHash: '0xbase-settlement' });
          return handler(request, context);
        };
      },
    },
    db: {
      TOTAL_TILES: 65536,
      getTile: () => null,
      getCurrentPrice: () => 0.03,
      getNextAvailableTileId: () => 123,
    },
    logger: { logX402Failure: (payload) => calls.logs.push(payload) },
    chains: {
      getChain(chainId) {
        assert.equal(chainId, 'casper');
        return casperConfig;
      },
    },
    casperClient: {
      createClient(options) {
        calls.createClient.push(options);
        return { getCurrentPrice: async () => 0.02 };
      },
    },
    casperX402: {
      csprToMotes(value) {
        assert.equal(value, 0.02);
        return '20000000';
      },
      buildCasperPaymentRequirements(args) {
        calls.buildCasperRequirements.push(args);
        return {
          scheme: 'exact',
          network: args.chainConfig.caip2,
          payTo: args.chainConfig.treasury,
          maxAmountRequired: args.priceInMotes,
          asset: args.chainConfig.paymentToken,
          resource: args.resource,
          description: `Claim tile #${args.tileId} on tiles.bot`,
        };
      },
      async verifyCasperPayment(paymentHeader, paymentRequirements) {
        calls.casperVerify.push({ paymentHeader, paymentRequirements });
        return { valid: true };
      },
      async settleCasperPayment(paymentHeader, paymentRequirements) {
        calls.casperSettle.push({ paymentHeader, paymentRequirements });
        return { settled: true, txHash: 'deploy-casper-settlement' };
      },
      buildCasperClaimInstructions(args) {
        calls.buildCasperInstructions.push(args);
        return {
          step1_approve: { entryPoint: 'approve', contract: args.chainConfig.paymentToken },
          step2_claim: { entryPoint: 'claim', contract: args.chainConfig.nftContract, args: { token_id: args.tileId } },
          step3_register: { method: 'POST', body: { chain: 'casper' } },
        };
      },
    },
    ...overrides,
  };

  let source = fs.readFileSync(path.join(ROOT, 'src/app/api/tiles/[id]/claim/route.js'), 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { withX402 } from 'x402-next';", 'const { withX402 } = __mocks.x402Next;')
    .replace(/import \{\n  getCurrentPrice,\n  getNextAvailableTileId,\n  getTile,\n  TOTAL_TILES,\n\} from '@\/lib\/db';/, 'const { getCurrentPrice, getNextAvailableTileId, getTile, TOTAL_TILES } = __mocks.db;')
    .replace("import { logX402Failure } from '@/lib/structured-logger';", 'const { logX402Failure } = __mocks.logger;')
    .replace("import { getChain } from '@/lib/chains';", 'const { getChain } = __mocks.chains;')
    .replace("import { createClient as createCasperClient } from '@/lib/casper-client';", 'const { createClient: createCasperClient } = __mocks.casperClient;')
    .replace(/import \{\n  csprToMotes,\n  buildCasperPaymentRequirements,\n  buildCasperClaimInstructions,\n  verifyCasperPayment,\n  settleCasperPayment,\n\} from '@\/lib\/casper-x402';/, 'const { csprToMotes, buildCasperPaymentRequirements, buildCasperClaimInstructions, verifyCasperPayment, settleCasperPayment } = __mocks.casperX402;')
    .replace('export async function POST(request, context) {', 'async function POST(request, context) {');

  if (/^import |^export /m.test(source)) {
    throw new Error('Claim route mocks failed to replace all imports/exports');
  }

  const context = {
    __mocks: mocks,
    module: { exports: {} },
    process: { env: { ...process.env } },
    Buffer,
    Response,
    Headers,
    URL,
    console,
  };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, {
    filename: path.join(ROOT, 'src/app/api/tiles/[id]/claim/route.js'),
  });
  return { POST: context.module.exports.POST, calls };
}

function loadStatsRoute(overrides = {}) {
  const calls = { chainPrices: [], buildPayload: [] };
  const chainStats = {
    base: { claimed: 4, totalRevenue: 0.09, currentPrice: 0.04 },
    casper: { claimed: 2, totalRevenue: 0.02, currentPrice: 0.02 },
  };
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      getClaimedCount: () => 6,
      getCurrentPrice: () => 0.99,
      TOTAL_TILES: 65536,
      getNextAvailableTileId: () => 124,
      getRecentlyClaimed: () => [
        { id: 122, name: 'Casper Agent', owner: '01' + 'b'.repeat(64), claimed_at: '2026-05-31T00:00:00.000Z', chain: 'casper' },
      ],
      getTopHolders: () => [{ owner: '0xbase-wallet', count: 4 }],
      getEstimatedSoldOutRevenue: () => 123456,
      getTotalRevenue: () => 0.11,
      getPerChainStats: () => chainStats,
    },
    chainApi: {
      CHAIN_PRICE_CACHE_CONTROL: 'public, max-age=30',
      async getCachedAllChainCurrentPrices(stats) {
        calls.chainPrices.push(stats);
        return {
          base: { currentPrice: 0.04, source: 'on-chain' },
          casper: { currentPrice: 0.02, source: 'on-chain' },
        };
      },
      buildChainStatsPayload(chainPrices, stats) {
        calls.buildPayload.push({ chainPrices, stats });
        return {
          base: { claimed: stats.base.claimed, totalRevenue: stats.base.totalRevenue, currentPrice: chainPrices.base.currentPrice, source: chainPrices.base.source },
          casper: { claimed: stats.casper.claimed, totalRevenue: stats.casper.totalRevenue, currentPrice: chainPrices.casper.currentPrice, source: chainPrices.casper.source },
        };
      },
    },
    ...overrides,
  };

  let source = fs.readFileSync(path.join(ROOT, 'src/app/api/stats/route.js'), 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace(/import \{\n  getClaimedCount,\n  getCurrentPrice,\n  TOTAL_TILES,\n  getNextAvailableTileId,\n  getRecentlyClaimed,\n  getTopHolders,\n  getEstimatedSoldOutRevenue,\n  getTotalRevenue,\n  getPerChainStats,\n\} from '@\/lib\/db';/, 'const { getClaimedCount, getCurrentPrice, TOTAL_TILES, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, getEstimatedSoldOutRevenue, getTotalRevenue, getPerChainStats } = __mocks.db;')
    .replace("import { buildChainStatsPayload, CHAIN_PRICE_CACHE_CONTROL, getCachedAllChainCurrentPrices } from '@/lib/chain-api';", 'const { buildChainStatsPayload, CHAIN_PRICE_CACHE_CONTROL, getCachedAllChainCurrentPrices } = __mocks.chainApi;')
    .replace('export async function GET() {', 'async function GET() {');

  if (/^import |^export /m.test(source)) {
    throw new Error('Stats route mocks failed to replace all imports/exports');
  }

  const context = { __mocks: mocks, module: { exports: {} }, Response, Headers, console };
  vm.runInNewContext(`${source}\nmodule.exports = { GET };`, context, {
    filename: path.join(ROOT, 'src/app/api/stats/route.js'),
  });
  return { GET: context.module.exports.GET, calls };
}

describe('DB-backed multi-chain grid and pricing', () => {
  let tmpDir;
  let db;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-full-multichain-'));
    process.env.DB_DIR = tmpDir;
    const dbUrl = `${pathToFileURL(path.join(ROOT, 'src/lib/db.js')).href}?suite=${Date.now()}`;
    db = await import(dbUrl);
  });

  // This block intentionally shares one tmp DB: each test adds claims so the
  // stats assertion proves accumulated Base/Casper counts in the shared namespace.

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('claims Base and Casper tiles into one shared grid namespace', () => {
    const baseTile = db.claimTile(100, '0xBaseWallet000000000000000000000000000000000', 0.01, 'base', '0xbase-nft');
    const casperTile = db.claimTile(101, '01' + 'b'.repeat(64), 0.01, 'casper', 'hash-casper-nft');

    assert.equal(baseTile.chain, 'base');
    assert.equal(casperTile.chain, 'casper');

    const grid = db.getGridState();
    assert.equal(grid.tiles[100].chain, 'base');
    assert.equal(grid.tiles[101].chain, 'casper');
  });

  it('rejects claiming a tile already claimed on another chain', () => {
    const first = db.claimTile(110, '0xBaseWallet000000000000000000000000000000000', 0.01, 'base', '0xbase-nft');
    const second = db.claimTile(110, '01' + 'c'.repeat(64), 0.01, 'casper', 'hash-casper-nft');

    assert.ok(first);
    assert.equal(second, null);
    assert.equal(db.getTile(110).chain, 'base');
  });

  it('reports per-chain stats and independent prices', () => {
    db.claimTile(120, '0xBaseWallet000000000000000000000000000000000', 0.01, 'base', '0xbase-nft');
    db.claimTile(121, '0xBaseWallet000000000000000000000000000000000', 0.01, 'base', '0xbase-nft');
    db.claimTile(122, '01' + 'd'.repeat(64), 0.01, 'casper', 'hash-casper-nft');

    const stats = db.getPerChainStats();
    assert.equal(stats.base.claimed, 4);
    assert.equal(stats.casper.claimed, 2);
    // Base prices in USDC (starts $0.01) and Casper in CSPR (starts 5 CSPR), so a
    // cross-chain magnitude comparison is meaningless. Prove each chain's bonding
    // curve climbs independently above its own start price as its claim count grows.
    const BASE_START_PRICE = 0.01;
    const CASPER_START_PRICE = 5;
    assert.ok(stats.base.currentPrice > BASE_START_PRICE, 'Base price should climb above its start with more claims');
    assert.ok(stats.casper.currentPrice > CASPER_START_PRICE, 'Casper price should climb above its start with more claims');
    assert.equal(db.getCurrentPriceByChain('base'), stats.base.currentPrice);
    assert.equal(db.getCurrentPriceByChain('casper'), stats.casper.currentPrice);
  });
});

describe('API route chain context', () => {
  it('batch claim defaults to Base and keeps backward compatibility', async () => {
    const { POST, calls } = loadBatchClaimRoute();

    const response = await POST(requestFor('https://tiles.bot/api/tiles/batch-claim', {
      tileIds: [1, 2],
      wallet: '0xwallet',
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.chain, 'base');
    assert.deepEqual(calls.currentPriceByChain, ['base', 'base', 'base']);
    assert.deepEqual(calls.claimTile.map(call => call.chain), ['base', 'base']);
  });

  it('batch claim uses Casper pricing and contract context when chain=casper', async () => {
    const { POST, calls } = loadBatchClaimRoute();

    const response = await POST(requestFor('https://tiles.bot/api/tiles/batch-claim?chain=casper', {
      tileIds: [7, 8],
      wallet: '01' + 'e'.repeat(64),
      chain: 'casper',
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.chain, 'casper');
    assert.equal(body.claimed, 2);
    assert.deepEqual(calls.claimTile.map(call => call.chain), ['casper', 'casper']);
    assert.deepEqual(calls.claimTile.map(call => call.chainContract), ['hash-casper-nft', 'hash-casper-nft']);
    assert.deepEqual(body.claimedTiles.map(tile => tile.chain), ['casper', 'casper']);
  });

  it('batch claim reports already-claimed shared-namespace tiles as skipped', async () => {
    const { POST } = loadBatchClaimRoute();

    const response = await POST(requestFor('https://tiles.bot/api/tiles/batch-claim?chain=casper', {
      tileIds: [9],
      wallet: '01' + 'f'.repeat(64),
      chain: 'casper',
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.claimed, 0);
    assert.equal(body.skipped, 1);
    assert.deepEqual(body.skippedTiles, [9]);
  });

  it('heartbeat logs activity with the tile chain context', async () => {
    const { POST, calls } = loadHeartbeatRoute();

    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/heartbeat?chain=casper', {
        wallet: '01' + 'a'.repeat(64),
        chain: 'casper',
      }),
      { params: Promise.resolve({ id: '42' }) }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.chain, 'casper');
    assert.equal(calls.logEvent.length, 1);
    assert.equal(calls.logEvent[0][4], 'casper');
  });

  it('Base claim route runs the x402 challenge, payment header, and settlement lifecycle', async () => {
    const { POST, calls } = loadClaimRoute();
    const wallet = '0xBaseWallet000000000000000000000000000000000';

    const challenge = await POST(
      requestFor('https://tiles.bot/api/tiles/50/claim'),
      { params: Promise.resolve({ id: '50' }) }
    );
    const challengeBody = await challenge.json();

    assert.equal(challenge.status, 402);
    assert.equal(challengeBody.accepts[0].price, '$0.03');
    assert.equal(challengeBody.accepts[0].network, 'base-sepolia');
    assert.equal(calls.baseVerify.length, 0);
    assert.equal(calls.baseSettle.length, 0);

    const paid = await POST(
      requestFor('https://tiles.bot/api/tiles/50/claim', {}, { 'x-payment': paymentHeaderFor(wallet) }),
      { params: Promise.resolve({ id: '50' }) }
    );
    const paidBody = await paid.json();

    assert.equal(paid.status, 200);
    assert.equal(paidBody.ok, true);
    assert.equal(paidBody.tileId, 50);
    assert.equal(paidBody.instructions.step2_claim.contract, process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
    assert.equal(calls.baseRequirements.length, 2);
    assert.equal(calls.baseVerify.length, 1);
    assert.equal(calls.baseSettle.length, 1);
    assert.equal(calls.baseVerify[0].paymentHeader, paymentHeaderFor(wallet));
    assert.equal(calls.createClient.length, 0);
    assert.equal(calls.casperVerify.length, 0);
  });

  it('Casper claim route runs payment requirements, verify, settle, and claim instructions', async () => {
    const { POST, calls } = loadClaimRoute();
    const paymentHeader = paymentHeaderFor('01' + 'c'.repeat(64));

    const challenge = await POST(
      requestFor('https://tiles.bot/api/tiles/51/claim?chain=casper'),
      { params: Promise.resolve({ id: '51' }) }
    );
    const challengeBody = await challenge.json();

    assert.equal(challenge.status, 402);
    assert.equal(challengeBody.accepts[0].network, 'casper:casper');
    assert.equal(challengeBody.accepts[0].maxAmountRequired, '20000000');
    assert.equal(calls.casperVerify.length, 0);
    assert.equal(calls.casperSettle.length, 0);

    const paid = await POST(
      requestFor('https://tiles.bot/api/tiles/51/claim?chain=casper', {}, { 'x-payment': paymentHeader }),
      { params: Promise.resolve({ id: '51' }) }
    );
    const paidBody = await paid.json();

    assert.equal(paid.status, 200);
    assert.equal(paidBody.chain, 'casper');
    assert.equal(paidBody.payment.verified, true);
    assert.equal(paidBody.payment.settled, true);
    assert.equal(paidBody.payment.txHash, 'deploy-casper-settlement');
    assert.equal(paidBody.instructions.step2_claim.entryPoint, 'claim');
    assert.equal(paidBody.instructions.step2_claim.args.token_id, 51);
    assert.equal(calls.createClient.length, 2);
    assert.equal(calls.buildCasperRequirements.length, 2);
    assert.equal(calls.casperVerify.length, 1);
    assert.equal(calls.casperSettle.length, 1);
    assert.equal(calls.casperVerify[0].paymentHeader, paymentHeader);
    assert.equal(calls.baseVerify.length, 0);
  });

  it('/api/stats HTTP route returns per-chain payload and Base-compatible currentPrice', async () => {
    const { GET, calls } = loadStatsRoute();

    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=30');
    assert.equal(body.claimed, 6);
    assert.equal(body.available, 65530);
    assert.equal(body.currentPrice, 0.04);
    assert.equal(body.perChain.base.claimed, 4);
    assert.equal(body.perChain.casper.claimed, 2);
    assert.equal(body.perChain.base.currentPrice, 0.04);
    assert.equal(body.perChain.casper.currentPrice, 0.02);
    assert.equal(body.recentlyClaimed[0].chain, 'casper');
    assert.equal(calls.chainPrices.length, 1);
    assert.equal(calls.buildPayload.length, 1);
  });
});

describe('chain metadata and API payload helpers', () => {
  it('builds chain-specific explorer links', () => {
    const { getChain } = require('../src/lib/chains');

    assert.equal(getChain('base').explorerTx('0xabc'), 'https://sepolia.basescan.org/tx/0xabc');
    assert.equal(getChain('casper').explorerTx('deploy-abc'), 'https://testnet.cspr.live/deploy/deploy-abc');
  });

  it('keeps per-chain stats separate while preserving default Base payloads', () => {
    const { buildChainStatsPayload } = require('../src/lib/chain-api');

    const payload = buildChainStatsPayload({
      base: { currentPrice: 0.04, source: 'on-chain' },
      casper: { currentPrice: 0.02, source: 'on-chain' },
    }, {
      base: { claimed: 4, totalRevenue: 0.06 },
      casper: { claimed: 2, totalRevenue: 0.02 },
    });

    assert.equal(payload.base.claimed, 4);
    assert.equal(payload.casper.claimed, 2);
    assert.equal(payload.base.currentPrice, 0.04);
    assert.equal(payload.casper.currentPrice, 0.02);
    assert.ok(payload.casper.currentPrice < payload.base.currentPrice, 'Casper remains cheaper with fewer claims');
  });
});
