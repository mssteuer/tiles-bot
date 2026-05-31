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

describe('DB-backed multi-chain grid and pricing', () => {
  let tmpDir;
  let db;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-full-multichain-'));
    process.env.DB_DIR = tmpDir;
    const dbUrl = `${pathToFileURL(path.join(ROOT, 'src/lib/db.js')).href}?suite=${Date.now()}`;
    db = await import(dbUrl);
  });

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
    assert.ok(stats.base.currentPrice > stats.casper.currentPrice, 'Base should be pricier with more claims');
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
