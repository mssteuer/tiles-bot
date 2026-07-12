const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const METADATA_ROUTE = path.join(ROOT, 'src', 'app', 'api', 'tiles', '[id]', 'metadata', 'route.js');
const HEARTBEAT_ROUTE = path.join(ROOT, 'src', 'app', 'api', 'tiles', '[id]', 'heartbeat', 'route.js');
const IMAGE_ROUTE = path.join(ROOT, 'src', 'app', 'api', 'tiles', '[id]', 'image', 'route.js');

const EVM_OWNER = '0xAbCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
const EVM_OWNER_DIFFERENT_CASE = EVM_OWNER.toLowerCase();
const EVM_INTRUDER = '0x000000000000000000000000000000000000dEaD';
const CASPER_OWNER = `01${'A'.repeat(64)}`;
const CASPER_OWNER_DIFFERENT_CASE = CASPER_OWNER.toLowerCase();
const CASPER_INTRUDER = `02${'b'.repeat(64)}`;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function requestFor(url, { body = {}, headers = {} } = {}) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
    async json() {
      return body;
    },
    async arrayBuffer() {
      return Buffer.from('not-a-real-image');
    },
  };
}

function ownedTile(owner, extra = {}) {
  return {
    id: 42,
    owner,
    name: 'Owner Test Tile',
    avatar: null,
    chain: owner.startsWith('0x') ? 'base' : 'casper',
    ...extra,
  };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function loadMetadataRoute({ owner = EVM_OWNER } = {}) {
  const calls = { updateTileMetadata: [], updateTileWebhook: [], logEvent: [] };
  const tile = ownedTile(owner);
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    viem: { verifyMessage: async () => true },
    db: {
      TOTAL_TILES: 65536,
      getTile: () => tile,
      updateTileWebhook: (...args) => calls.updateTileWebhook.push(args),
      logEvent: (...args) => calls.logEvent.push(args),
      updateTileMetadata: (tileId, metadata) => {
        calls.updateTileMetadata.push({ tileId, metadata });
        return { ...tile, ...metadata };
      },
    },
    openseaMetadata: {
      buildTileTokenMetadata: () => ({}),
      getSiteUrl: () => 'https://tiles.bot',
    },
    verifyWalletSig: { verifyWalletSignature: async () => true },
  };

  let source = fs.readFileSync(METADATA_ROUTE, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { verifyMessage } from 'viem';", 'const { verifyMessage } = __mocks.viem;')
    .replace("import { getTile, TOTAL_TILES, updateTileWebhook, logEvent } from '@/lib/db';", 'const { getTile, TOTAL_TILES, updateTileWebhook, logEvent } = __mocks.db;')
    .replace("import { buildTileTokenMetadata, getSiteUrl } from '@/lib/openseaMetadata';", 'const { buildTileTokenMetadata, getSiteUrl } = __mocks.openseaMetadata;')
    .replace("const { verifyWalletSignature } = await import('@/lib/verify-wallet-sig');", 'const { verifyWalletSignature } = __mocks.verifyWalletSig;')
    .replace("const { updateTileMetadata } = await import('@/lib/db');", 'const { updateTileMetadata } = __mocks.db;')
    .replace('export async function GET(request, { params }) {', 'async function GET(request, { params }) {')
    .replace('export async function PUT(request, { params }) {', 'async function PUT(request, { params }) {');

  if (/^import |^export /m.test(source)) throw new Error('metadata route mock replacement missed an import/export');
  const context = { __mocks: mocks, module: { exports: {} }, exports: {}, Response, Headers, URL, console, Date };
  vm.runInNewContext(`${source}\nmodule.exports = { GET, PUT };`, context, { filename: METADATA_ROUTE });
  return { PUT: context.module.exports.PUT, calls };
}

function loadHeartbeatRoute({ owner = EVM_OWNER } = {}) {
  const calls = { heartbeat: [], logEvent: [] };
  const tile = ownedTile(owner);
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      TOTAL_TILES: 65536,
      heartbeat: (tileId, wallet) => {
        calls.heartbeat.push({ tileId, wallet });
        return wallet.toLowerCase() === owner.toLowerCase() ? { ...tile, id: tileId } : null;
      },
      logEvent: (...args) => calls.logEvent.push(args),
    },
    chainApi: {
      resolveRequestedChainId(request, body) {
        return body?.chain || request.nextUrl.searchParams.get('chain') || 'base';
      },
      assertSupportedChain(chainId) {
        if (!['base', 'casper'].includes(chainId)) throw new Error(`Unknown chain: ${chainId}`);
        return { id: chainId };
      },
    },
  };

  let source = fs.readFileSync(HEARTBEAT_ROUTE, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { heartbeat, logEvent, TOTAL_TILES } from '@/lib/db';", 'const { heartbeat, logEvent, TOTAL_TILES } = __mocks.db;')
    .replace("import { assertSupportedChain, resolveRequestedChainId } from '@/lib/chain-api';", 'const { assertSupportedChain, resolveRequestedChainId } = __mocks.chainApi;')
    .replace('export async function POST(request, { params }) {', 'async function POST(request, { params }) {');

  if (/^import |^export /m.test(source)) throw new Error('heartbeat route mock replacement missed an import/export');
  const context = { __mocks: mocks, module: { exports: {} }, exports: {}, Response, Headers, URL, console };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, { filename: HEARTBEAT_ROUTE });
  return { POST: context.module.exports.POST, calls };
}

function loadImageRoute({ owner = EVM_OWNER, onChainOwner = owner } = {}) {
  const calls = { updateTileMetadata: [], writeFile: [], logEvent: [], broadcasts: [], filebase: [] };
  const tile = ownedTile(owner);
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      getTile: () => tile,
      updateTileMetadata: (tileId, metadata) => {
        calls.updateTileMetadata.push({ tileId, metadata });
        return { ...tile, ...metadata };
      },
      logEvent: (...args) => calls.logEvent.push(args),
    },
    fsPromises: {
      writeFile: (...args) => { calls.writeFile.push(args); return Promise.resolve(); },
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.resolve(Buffer.from('stored')),
    },
    fs: { existsSync: () => true },
    sharp: () => ({
      metadata: async () => ({ width: 64, height: 64, format: 'png' }),
      resize() { return this; },
      png() { return this; },
      webp() { return this; },
      clone() { return this; },
      toBuffer: async () => Buffer.from('processed'),
    }),
    filebase: {
      isFilebaseConfigured: () => false,
      uploadToFilebase: (...args) => { calls.filebase.push(args); return Promise.resolve(null); },
    },
    sse: { broadcast: (payload) => calls.broadcasts.push(payload) },
    viem: {
      createPublicClient: () => ({ readContract: async () => onChainOwner }),
      http: () => ({}),
      parseAbi: (abi) => abi,
      base: {},
    },
  };

  let source = fs.readFileSync(IMAGE_ROUTE, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { getTile, updateTileMetadata, logEvent } from '@/lib/db';", 'const { getTile, updateTileMetadata, logEvent } = __mocks.db;')
    .replace("import { writeFile, mkdir, readFile } from 'fs/promises';", 'const { writeFile, mkdir, readFile } = __mocks.fsPromises;')
    .replace("import { existsSync } from 'fs';", 'const { existsSync } = __mocks.fs;')
    .replace("import sharp from 'sharp';", 'const sharp = __mocks.sharp;')
    .replace("import { isFilebaseConfigured, uploadToFilebase } from '@/lib/filebase';", 'const { isFilebaseConfigured, uploadToFilebase } = __mocks.filebase;')
    .replace("import { broadcast } from '@/lib/sse-broadcast';", 'const { broadcast } = __mocks.sse;')
    .replace("const { createPublicClient, http: viemHttp } = await import('viem');", 'const { createPublicClient, http: viemHttp } = __mocks.viem;')
    .replace("const { base } = await import('viem/chains');", 'const { base } = __mocks.viem;')
    .replace("const { parseAbi } = await import('viem');", 'const { parseAbi } = __mocks.viem;')
    .replace('export const maxDuration = 30;', 'const maxDuration = 30;')
    .replace("export const dynamic = 'force-dynamic';", "const dynamic = 'force-dynamic';")
    .replace('export async function POST(request, { params }) {', 'async function POST(request, { params }) {')
    .replace('export async function GET(request, { params }) {', 'async function GET(request, { params }) {');

  if (/^import |^export /m.test(source)) throw new Error('image route mock replacement missed an import/export');
  const context = {
    __mocks: mocks,
    module: { exports: {} },
    exports: {},
    process: { env: { ...process.env }, cwd: () => ROOT },
    Buffer,
    Response,
    Headers,
    URL,
    console,
  };
  vm.runInNewContext(`${source}\nmodule.exports = { POST, GET };`, context, { filename: IMAGE_ROUTE });
  return { POST: context.module.exports.POST, calls };
}

describe('tile metadata route ownership', () => {
  it('accepts an EVM owner case-insensitively through the legacy wallet path', async () => {
    const { PUT, calls } = loadMetadataRoute({ owner: EVM_OWNER });
    const response = await PUT(
      requestFor('https://tiles.bot/api/tiles/42/metadata', {
        headers: { 'X-Wallet': EVM_OWNER_DIFFERENT_CASE },
        body: { name: 'Updated by owner' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.updateTileMetadata.length, 1);
    assert.equal(calls.updateTileMetadata[0].tileId, 42);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.updateTileMetadata[0].metadata)), { name: 'Updated by owner' });
  });

  it('accepts a Casper public-key owner through the legacy wallet path', async () => {
    const { PUT, calls } = loadMetadataRoute({ owner: CASPER_OWNER });
    const response = await PUT(
      requestFor('https://tiles.bot/api/tiles/42/metadata', {
        headers: { 'X-Wallet': CASPER_OWNER_DIFFERENT_CASE },
        body: { status: 'online' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.updateTileMetadata.length, 1);
  });

  it('rejects a metadata update from a non-owner with HTTP 403', async () => {
    const { PUT, calls } = loadMetadataRoute({ owner: EVM_OWNER });
    const response = await PUT(
      requestFor('https://tiles.bot/api/tiles/42/metadata', {
        headers: { 'X-Wallet': EVM_INTRUDER },
        body: { name: 'Intruder' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );
    const body = await responseJson(response);

    assert.equal(response.status, 403);
    assert.equal(body.error, 'Not tile owner');
    assert.deepEqual(calls.updateTileMetadata, []);
  });
});

describe('tile heartbeat route ownership', () => {
  it('accepts an EVM owner case-insensitively', async () => {
    const { POST, calls } = loadHeartbeatRoute({ owner: EVM_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/heartbeat', { body: { wallet: EVM_OWNER_DIFFERENT_CASE, chain: 'base' } }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.logEvent.length, 1);
  });

  it('accepts a Casper public-key owner case-insensitively', async () => {
    const { POST, calls } = loadHeartbeatRoute({ owner: CASPER_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/heartbeat', { body: { wallet: CASPER_OWNER_DIFFERENT_CASE, chain: 'casper' } }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.logEvent[0][4], 'casper');
  });

  it('rejects a heartbeat from a non-owner without logging activity', async () => {
    const { POST, calls } = loadHeartbeatRoute({ owner: CASPER_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/heartbeat', { body: { wallet: CASPER_INTRUDER, chain: 'casper' } }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(calls.logEvent, []);
  });
});

describe('tile image route ownership', () => {
  it('accepts an EVM owner case-insensitively and updates image metadata', async () => {
    const { POST, calls } = loadImageRoute({ owner: EVM_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/image', {
        headers: { 'x-wallet': EVM_OWNER_DIFFERENT_CASE, 'content-type': 'application/octet-stream' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.updateTileMetadata.length, 1);
    assert.equal(calls.updateTileMetadata[0].tileId, 42);
    assert.deepEqual(JSON.parse(JSON.stringify(calls.updateTileMetadata[0].metadata)), { imageUrl: '/tile-images/42.png' });
  });

  it('accepts a Casper public-key owner case-insensitively and updates image metadata', async () => {
    const { POST, calls } = loadImageRoute({ owner: CASPER_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/image', {
        headers: { 'x-wallet': CASPER_OWNER_DIFFERENT_CASE, 'content-type': 'application/octet-stream' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );

    assert.equal(response.status, 200);
    assert.equal(calls.updateTileMetadata.length, 1);
  });

  it('rejects image upload from a non-owner with HTTP 403 before writing files', async () => {
    const { POST, calls } = loadImageRoute({ owner: EVM_OWNER, onChainOwner: EVM_OWNER });
    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/image', {
        headers: { 'x-wallet': EVM_INTRUDER, 'content-type': 'application/octet-stream' },
      }),
      { params: Promise.resolve({ id: '42' }) },
    );
    const body = await responseJson(response);

    assert.equal(response.status, 403);
    assert.equal(body.error, 'Not tile owner');
    assert.deepEqual(calls.writeFile, []);
    assert.deepEqual(calls.updateTileMetadata, []);
  });
});
