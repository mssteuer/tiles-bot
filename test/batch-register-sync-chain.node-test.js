/**
 * Route coverage for /api/tiles/batch-register and /api/tiles/sync-chain.
 *
 * These tests execute app-router modules with lightweight mocks because the
 * route files use Next.js imports and @ aliases that plain Node cannot load.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BATCH_ROUTE_PATH = path.join(ROOT, 'src', 'app', 'api', 'tiles', 'batch-register', 'route.js');
const SYNC_ROUTE_PATH = path.join(ROOT, 'src', 'app', 'api', 'tiles', 'sync-chain', 'route.js');

const BASE_CHAIN = {
  id: 'base',
  name: 'Base',
  nftContract: '0xbase-nft',
  rpcUrl: 'https://base.example/rpc',
};

const CASPER_CHAIN = {
  id: 'casper',
  name: 'Casper',
  nftContract: 'hash-casper-nft',
  rpcUrl: 'https://casper.example/rpc',
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeRequest(url, body, headers = {}) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    async json() {
      return body;
    },
  };
}

function makeDbMocks() {
  const claimed = new Map();
  const txHashes = new Map();
  const calls = { claimTile: [], setTileTxHash: [], broadcasts: [] };

  return {
    calls,
    db: {
      TOTAL_TILES: 65536,
      claimTile(tileId, wallet, price, chainId = 'base', chainContract = null) {
        calls.claimTile.push({ tileId, wallet, price, chainId, chainContract });
        if (claimed.has(tileId)) return null;
        const tile = {
          id: tileId,
          owner: wallet,
          price_paid: price,
          chain: chainId,
          chainContract,
          claimed_at: 1710000000 + tileId,
        };
        claimed.set(tileId, tile);
        return tile;
      },
      getClaimedCount() {
        return claimed.size;
      },
      getCurrentPriceByChain(chainId) {
        return chainId === 'casper' ? 0.02 : 0.01;
      },
      getNextAvailableTileId() {
        for (let id = 0; id < 65536; id += 1) {
          if (!claimed.has(id)) return id;
        }
        return null;
      },
      getRecentlyClaimed() {
        return [...claimed.values()].slice(-10);
      },
      getTopHolders() {
        const counts = new Map();
        for (const tile of claimed.values()) counts.set(tile.owner, (counts.get(tile.owner) || 0) + 1);
        return [...counts.entries()].map(([owner, count]) => ({ owner, count }));
      },
      setTileTxHash(tileId, txHash) {
        calls.setTileTxHash.push({ tileId, txHash });
        txHashes.set(tileId, txHash);
      },
    },
  };
}

function makeChainApiMocks(overrides = {}) {
  const calls = {
    verifyBatchMintTransaction: [],
    verifyOwnershipOnChain: [],
    getChainCurrentPrice: [],
  };
  const verifiedBatchIds = overrides.verifiedBatchIds || [7, 8, 9];
  const ownership = overrides.ownership || new Map();

  return {
    calls,
    chainApi: {
      assertSupportedChain(chainId) {
        if (chainId === 'base') return BASE_CHAIN;
        if (chainId === 'casper') return CASPER_CHAIN;
        throw new Error(`Unsupported chain: ${chainId}`);
      },
      async getChainCurrentPrice(chainId) {
        calls.getChainCurrentPrice.push(chainId);
        return { currentPrice: chainId === 'casper' ? 0.02 : 0.01 };
      },
      resolveRequestedChainId(request, body = {}) {
        return String(
          body?.chain
          || request?.nextUrl?.searchParams?.get('chain')
          || request?.headers?.get('x-chain')
          || request?.headers?.get('x-tiles-chain')
          || 'base'
        ).toLowerCase();
      },
      async verifyBatchMintTransaction(args) {
        calls.verifyBatchMintTransaction.push(args);
        return { verifiedTileIds: verifiedBatchIds };
      },
      async verifyOwnershipOnChain(chainId, tileId, wallet) {
        calls.verifyOwnershipOnChain.push({ chainId, tileId, wallet });
        const key = `${chainId}:${tileId}:${wallet}`;
        return { isOwner: ownership.has(key) ? ownership.get(key) : false };
      },
    },
  };
}

function loadBatchRouteWithMocks(overrides = {}) {
  const { calls: dbCalls, db } = makeDbMocks();
  const { calls: chainCalls, chainApi } = makeChainApiMocks(overrides);
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db,
    chainApi,
    sse: { broadcast(payload) { dbCalls.broadcasts.push(payload); } },
  };

  let source = fs.readFileSync(BATCH_ROUTE_PATH, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace(/import \{\n  claimTile,\n  getClaimedCount,\n  getCurrentPriceByChain,\n  getNextAvailableTileId,\n  getRecentlyClaimed,\n  getTopHolders,\n  setTileTxHash,\n  TOTAL_TILES,\n\} from '@\/lib\/db';/, 'const { claimTile, getClaimedCount, getCurrentPriceByChain, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, setTileTxHash, TOTAL_TILES } = __mocks.db;')
    .replace(/import \{\n  assertSupportedChain,\n  getChainCurrentPrice,\n  resolveRequestedChainId,\n  verifyBatchMintTransaction,\n\} from '@\/lib\/chain-api';/, 'const { assertSupportedChain, getChainCurrentPrice, resolveRequestedChainId, verifyBatchMintTransaction } = __mocks.chainApi;')
    .replace("import { broadcast } from '@/lib/sse-broadcast';", 'const { broadcast } = __mocks.sse;')
    .replace('export async function POST(request) {', 'async function POST(request) {');

  if (/^import |^export /m.test(source)) throw new Error('batch-register route mock replacement missed an import/export');

  const context = { __mocks: mocks, module: { exports: {} }, exports: {}, Response, URL, Headers, console };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, { filename: BATCH_ROUTE_PATH });
  return { POST: context.module.exports.POST, dbCalls, chainCalls };
}

function loadSyncRouteWithMocks(overrides = {}) {
  const { calls: dbCalls, db } = makeDbMocks();
  const { calls: chainCalls, chainApi } = makeChainApiMocks(overrides);
  const viemCalls = { createPublicClient: [], getLogs: [] };
  const transferLogs = overrides.transferLogs || [];

  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db,
    chainApi,
    chains: { getSupportedChains: () => [BASE_CHAIN, CASPER_CHAIN] },
    sse: { broadcast(payload) { dbCalls.broadcasts.push(payload); } },
    logger: { logChainSyncError() {} },
    viem: {
      createPublicClient(options) {
        viemCalls.createPublicClient.push(options);
        return {
          readContract: async () => BigInt(overrides.totalMinted ?? transferLogs.length),
          getBlockNumber: async () => 100n,
          async getLogs(args) {
            viemCalls.getLogs.push(args);
            return transferLogs;
          },
        };
      },
      http: (url) => ({ url }),
      parseAbi: (abi) => abi.map((item) => ({ abi: item })),
      viemChains: { base: { id: 8453 }, baseSepolia: { id: 84532 } },
    },
  };

  let source = fs.readFileSync(SYNC_ROUTE_PATH, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace(/import \{\n  claimTile,\n  getClaimedCount,\n  getCurrentPriceByChain,\n  getNextAvailableTileId,\n  getRecentlyClaimed,\n  getTopHolders,\n  setTileTxHash,\n  TOTAL_TILES,\n\} from '@\/lib\/db';/, 'const { claimTile, getClaimedCount, getCurrentPriceByChain, getNextAvailableTileId, getRecentlyClaimed, getTopHolders, setTileTxHash, TOTAL_TILES } = __mocks.db;')
    .replace(/import \{\n  assertSupportedChain,\n  getChainCurrentPrice,\n  resolveRequestedChainId,\n  verifyOwnershipOnChain,\n\} from '@\/lib\/chain-api';/, 'const { assertSupportedChain, getChainCurrentPrice, resolveRequestedChainId, verifyOwnershipOnChain } = __mocks.chainApi;')
    .replace("import { getSupportedChains } from '@/lib/chains';", 'const { getSupportedChains } = __mocks.chains;')
    .replace("import { broadcast } from '@/lib/sse-broadcast';", 'const { broadcast } = __mocks.sse;')
    .replace("import { logChainSyncError } from '@/lib/structured-logger';", 'const { logChainSyncError } = __mocks.logger;')
    .replace("  const { createPublicClient, http, parseAbi } = await import('viem');\n  const viemChains = await import('viem/chains');", '  const { createPublicClient, http, parseAbi } = __mocks.viem;\n  const viemChains = __mocks.viem.viemChains;')
    .replace('export async function GET(request) {', 'async function GET(request) {')
    .replace('export async function POST(request) {', 'async function POST(request) {');

  if (/^import |^export /m.test(source)) throw new Error('sync-chain route mock replacement missed an import/export');

  const context = {
    __mocks: mocks,
    module: { exports: {} },
    exports: {},
    process: { env: { ...process.env } },
    Response,
    URL,
    Headers,
    console,
    BigInt,
  };
  vm.runInNewContext(`${source}\nmodule.exports = { GET, POST };`, context, { filename: SYNC_ROUTE_PATH });
  return { GET: context.module.exports.GET, POST: context.module.exports.POST, dbCalls, chainCalls, viemCalls };
}

describe('/api/tiles/batch-register route', () => {
  it('preserves Base batch registration and records tx hashes from verified EVM mints', async () => {
    const { POST, dbCalls, chainCalls } = loadBatchRouteWithMocks({ verifiedBatchIds: [7, 8] });

    const response = await POST(makeRequest('https://tiles.bot/api/tiles/batch-register', {
      wallet: '0xabc',
      tileIds: [7, 8],
      txHash: '0xbase-tx',
    }));
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.chain, 'base');
    assert.equal(body.registered, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(chainCalls.verifyBatchMintTransaction)), [{
      chainId: 'base',
      tileIds: [7, 8],
      wallet: '0xabc',
      txHash: '0xbase-tx',
    }]);
    assert.deepEqual(dbCalls.claimTile.map(c => [c.tileId, c.chainId, c.chainContract]), [
      [7, 'base', '0xbase-nft'],
      [8, 'base', '0xbase-nft'],
    ]);
    assert.deepEqual(dbCalls.setTileTxHash, [
      { tileId: 7, txHash: '0xbase-tx' },
      { tileId: 8, txHash: '0xbase-tx' },
    ]);
  });

  it('uses Casper deployHash verification and never falls through to Base transaction parsing', async () => {
    const { POST, dbCalls, chainCalls } = loadBatchRouteWithMocks({ verifiedBatchIds: [42] });

    const response = await POST(makeRequest('https://tiles.bot/api/tiles/batch-register', {
      wallet: '01' + 'a'.repeat(64),
      tileIds: [42, 43],
      deployHash: 'casper-deploy-hash',
      chain: 'casper',
    }));
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.chain, 'casper');
    assert.equal(body.registered, 1);
    assert.equal(body.skipped, 1);
    assert.deepEqual(body.skippedDetails, [{ tileId: 43, reason: 'not verified in casper transaction/deploy' }]);
    assert.deepEqual(JSON.parse(JSON.stringify(chainCalls.verifyBatchMintTransaction)), [{
      chainId: 'casper',
      tileIds: [42, 43],
      wallet: '01' + 'a'.repeat(64),
      txHash: 'casper-deploy-hash',
    }]);
    assert.deepEqual(dbCalls.claimTile.map(c => [c.tileId, c.chainId, c.chainContract]), [
      [42, 'casper', 'hash-casper-nft'],
    ]);
    assert.deepEqual(dbCalls.setTileTxHash, [{ tileId: 42, txHash: 'casper-deploy-hash' }]);
  });
});

describe('/api/tiles/sync-chain route', () => {
  it('reconciles Base Transfer logs with Base chain metadata and tx hashes', async () => {
    const transferLogs = [{
      args: { tokenId: 5n, to: '0xowner' },
      transactionHash: '0xmint-tx',
    }];
    const { POST, dbCalls, viemCalls } = loadSyncRouteWithMocks({ transferLogs, totalMinted: 11 });

    const response = await POST(makeRequest('https://tiles.bot/api/tiles/sync-chain', { chain: 'base' }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.newlyRegistered, 1);
    assert.deepEqual(body.chains[0], {
      chain: 'base',
      onChainTotal: 11,
      logsFound: 1,
      newlyRegistered: 1,
      alreadyInDb: 0,
      registeredTileIds: [5],
      skipped: [],
    });
    assert.equal(viemCalls.createPublicClient.length, 1);
    assert.deepEqual(dbCalls.claimTile.map(c => [c.tileId, c.wallet, c.chainId, c.chainContract]), [
      [5, '0xowner', 'base', '0xbase-nft'],
    ]);
    assert.deepEqual(dbCalls.setTileTxHash, [{ tileId: 5, txHash: '0xmint-tx' }]);
  });

  it('reconciles Casper by explicit wallet + tileIds using Casper ownership checks only', async () => {
    const wallet = '01' + 'b'.repeat(64);
    const ownership = new Map([
      [`casper:12:${wallet.toLowerCase()}`, true],
      [`casper:13:${wallet.toLowerCase()}`, false],
    ]);
    const { POST, dbCalls, chainCalls, viemCalls } = loadSyncRouteWithMocks({ ownership });

    const response = await POST(makeRequest('https://tiles.bot/api/tiles/sync-chain', {
      chain: 'casper',
      wallet,
      tileIds: [12, 13],
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.newlyRegistered, 1);
    assert.deepEqual(body.chains[0], {
      chain: 'casper',
      newlyRegistered: 1,
      alreadyInDb: 0,
      skipped: [{ tileId: 13, reason: 'wallet is not owner on Casper' }],
      registeredTileIds: [12],
    });
    assert.deepEqual(chainCalls.verifyOwnershipOnChain, [
      { chainId: 'casper', tileId: 12, wallet: wallet.toLowerCase() },
      { chainId: 'casper', tileId: 13, wallet: wallet.toLowerCase() },
    ]);
    assert.deepEqual(dbCalls.claimTile.map(c => [c.tileId, c.wallet, c.chainId, c.chainContract]), [
      [12, wallet.toLowerCase(), 'casper', 'hash-casper-nft'],
    ]);
    assert.equal(viemCalls.createPublicClient.length, 0, 'Casper sync must not instantiate the EVM log scanner');
  });
});
