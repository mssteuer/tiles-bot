const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SEARCH_ROUTE = path.join(ROOT, 'src', 'app', 'api', 'tiles', 'search', 'route.js');
const OWNER_ROUTE = path.join(ROOT, 'src', 'app', 'api', 'owner', '[address]', 'route.js');

const EVM_OWNER = '0xAbCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
const CASPER_PUBLIC_KEY = `01${'a'.repeat(64)}`;
const CASPER_PUBLIC_KEY_MIXED = `02${'Bb'.repeat(32)}`;
const CASPER_ACCOUNT_HASH = `account-hash-${'c'.repeat(64)}`;

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function makeTile({ id, owner, name, chain = 'casper', chainContract = 'hash-casper-nft' }) {
  return {
    id,
    owner,
    name,
    description: 'fixture tile',
    xHandle: null,
    githubUsername: null,
    category: 'coding',
    status: 'online',
    claimedAt: `2026-07-22T00:00:0${id}Z`,
    repScore: id,
    chain,
    chainContract,
  };
}

const fixtureTiles = [
  makeTile({ id: 1, owner: EVM_OWNER, name: 'Base Bot', chain: 'base', chainContract: '0xbase' }),
  makeTile({ id: 2, owner: CASPER_PUBLIC_KEY, name: 'Casper Public Key Bot' }),
  makeTile({ id: 3, owner: CASPER_ACCOUNT_HASH, name: 'Casper Account Hash Bot' }),
];

function loadSearchRoute() {
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      getClaimedTiles: ({ category = null } = {}) => fixtureTiles.filter(t => !category || t.category === category),
    },
  };
  let source = fs.readFileSync(SEARCH_ROUTE, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace("import { getClaimedTiles } from '@/lib/db';", 'const { getClaimedTiles } = __mocks.db;')
    .replace('export async function GET(request) {', 'async function GET(request) {');
  if (/^import |^export /m.test(source)) throw new Error('search route mock replacement missed an import/export');
  const context = { __mocks: mocks, module: { exports: {} }, Response, Headers, URL, console };
  vm.runInNewContext(`${source}\nmodule.exports = { GET };`, context, { filename: SEARCH_ROUTE });
  return context.module.exports.GET;
}

function loadOwnerRoute() {
  const calls = { getTilesByOwner: [] };
  const mocks = {
    nextServer: { NextResponse: { json: jsonResponse } },
    db: {
      getClaimedCount: () => fixtureTiles.length,
      getTilesByOwner: (address) => {
        calls.getTilesByOwner.push(address);
        return fixtureTiles.filter(t => t.owner.toLowerCase() === address.toLowerCase());
      },
    },
  };
  let source = fs.readFileSync(OWNER_ROUTE, 'utf8');
  source = source
    .replace("import { getTilesByOwner, getClaimedCount } from '@/lib/db';", 'const { getTilesByOwner, getClaimedCount } = __mocks.db;')
    .replace("import { NextResponse } from 'next/server';", 'const { NextResponse } = __mocks.nextServer;')
    .replace('export async function GET(request, { params }) {', 'async function GET(request, { params }) {');
  if (/^import |^export /m.test(source)) throw new Error('owner route mock replacement missed an import/export');
  const context = { __mocks: mocks, module: { exports: {} }, Response, Headers, URL, console };
  vm.runInNewContext(`${source}\nmodule.exports = { GET };`, context, { filename: OWNER_ROUTE });
  return { GET: context.module.exports.GET, calls };
}

describe('Casper owner/search API coverage', () => {
  it('searches claimed tiles by Casper public key owner text', async () => {
    const GET = loadSearchRoute();
    const response = await GET({ url: `https://tiles.bot/api/tiles/search?q=${CASPER_PUBLIC_KEY}&limit=10` });
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.tiles[0].owner, CASPER_PUBLIC_KEY);
    assert.equal(body.tiles[0].chain, 'casper');
  });

  it('filters search results by Casper account-hash owner', async () => {
    const GET = loadSearchRoute();
    const response = await GET({ url: `https://tiles.bot/api/tiles/search?owner=${CASPER_ACCOUNT_HASH.toUpperCase()}&limit=10` });
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.tiles[0].owner, CASPER_ACCOUNT_HASH);
  });

  it('accepts Casper public keys on /api/owner/[address]', async () => {
    const { GET, calls } = loadOwnerRoute();
    const response = await GET({}, { params: Promise.resolve({ address: CASPER_PUBLIC_KEY_MIXED }) });
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.deepEqual(calls.getTilesByOwner, [CASPER_PUBLIC_KEY_MIXED]);
    assert.equal(body.owner, CASPER_PUBLIC_KEY_MIXED);
    assert.equal(body.stats.totalTiles, 0);
  });

  it('accepts Casper account-hash owners on /api/owner/[address]', async () => {
    const { GET } = loadOwnerRoute();
    const response = await GET({}, { params: Promise.resolve({ address: CASPER_ACCOUNT_HASH }) });
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.owner, CASPER_ACCOUNT_HASH);
    assert.equal(body.tiles[0].name, 'Casper Account Hash Bot');
  });

  it('still rejects malformed owner addresses', async () => {
    const { GET } = loadOwnerRoute();
    const response = await GET({}, { params: Promise.resolve({ address: 'casper-not-a-real-address' }) });
    const body = await responseJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid address');
  });
});