/**
 * Tests for /api/tiles/:id/claim Casper x402 routing.
 *
 * These tests execute the route module with lightweight mocks because Next.js
 * route files use app-router imports and @ aliases that Node's test runner
 * cannot resolve directly.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROUTE_PATH = path.join(__dirname, '..', 'src', 'app', 'api', 'tiles', '[id]', 'claim', 'route.js');

function loadRouteWithMocks(overrides = {}) {
  const calls = {
    baseHandler: 0,
    createClient: [],
    buildRequirements: [],
    verify: [],
    settle: [],
    buildInstructions: [],
    logs: [],
  };

  const casperConfig = {
    id: 'casper',
    caip2: 'casper:casper',
    chainName: 'casper-test',
    name: 'Casper',
    nftContract: 'hash-nft-contract',
    paymentToken: 'hash-wcspr-token',
    treasury: '01' + 'a'.repeat(64),
    rpcUrl: 'https://node.casper.example/rpc',
    explorer: 'https://cspr.live',
    x402Facilitator: 'https://x402-facilitator.cspr.cloud',
  };

  const mocks = {
    nextServer: {
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            status: init.status || 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    },
    x402Next: {
      withX402() {
        return async () => {
          calls.baseHandler += 1;
          return new Response(JSON.stringify({ ok: true, chain: 'base' }), {
            status: 209,
            headers: { 'content-type': 'application/json' },
          });
        };
      },
    },
    db: {
      TOTAL_TILES: 65536,
      getTile: () => null,
      getCurrentPrice: () => 0.01,
      getNextAvailableTileId: () => 7,
    },
    logger: {
      logX402Failure(payload) {
        calls.logs.push(payload);
      },
    },
    chains: {
      getChain(chainId) {
        assert.equal(chainId, 'casper');
        return casperConfig;
      },
    },
    casperClient: {
      createClient(options) {
        calls.createClient.push(options);
        return {
          getCurrentPrice: async () => 0.01,
        };
      },
    },
    casperX402: {
      csprToMotes(value) {
        assert.equal(value, 0.01);
        return '10000000';
      },
      buildCasperPaymentRequirements(args) {
        calls.buildRequirements.push(args);
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
        calls.verify.push({ paymentHeader, paymentRequirements });
        return { valid: true, error: null };
      },
      async settleCasperPayment(paymentHeader, paymentRequirements) {
        calls.settle.push({ paymentHeader, paymentRequirements });
        return { settled: true, txHash: 'deploy-hash-123', error: null };
      },
      buildCasperClaimInstructions(args) {
        calls.buildInstructions.push(args);
        return {
          step2_claim: {
            contract: args.chainConfig.nftContract,
            entryPoint: 'claim',
            args: { token_id: args.tileId },
          },
        };
      },
    },
    ...overrides,
  };

  let source = fs.readFileSync(ROUTE_PATH, 'utf8');
  source = source
    .replace("import { NextResponse } from 'next/server';", "const { NextResponse } = __mocks.nextServer;")
    .replace("import { withX402 } from 'x402-next';", "const { withX402 } = __mocks.x402Next;")
    .replace(/import \{\n  getCurrentPrice,\n  getNextAvailableTileId,\n  getTile,\n  TOTAL_TILES,\n\} from '@\/lib\/db';/, "const { getCurrentPrice, getNextAvailableTileId, getTile, TOTAL_TILES } = __mocks.db;")
    .replace("import { logX402Failure } from '@/lib/structured-logger';", "const { logX402Failure } = __mocks.logger;")
    .replace("import { getChain } from '@/lib/chains';", "const { getChain } = __mocks.chains;")
    .replace("import { createClient as createCasperClient } from '@/lib/casper-client';", "const { createClient: createCasperClient } = __mocks.casperClient;")
    .replace(/import \{\n  csprToMotes,\n  buildCasperPaymentRequirements,\n  buildCasperClaimInstructions,\n  verifyCasperPayment,\n  settleCasperPayment,\n\} from '@\/lib\/casper-x402';/, "const { csprToMotes, buildCasperPaymentRequirements, buildCasperClaimInstructions, verifyCasperPayment, settleCasperPayment } = __mocks.casperX402;")
    .replace('export async function POST(request, context) {', 'async function POST(request, context) {');

  if (/^import |^export /m.test(source)) {
    throw new Error('Route test mocks failed to replace all ESM imports/exports');
  }

  const context = {
    __mocks: mocks,
    module: { exports: {} },
    exports: {},
    process: { env: { ...process.env } },
    Buffer,
    Response,
    URL,
    Headers,
  };
  vm.runInNewContext(`${source}\nmodule.exports = { POST };`, context, { filename: ROUTE_PATH });
  return { POST: context.module.exports.POST, calls };
}

function requestFor(url, headers = {}) {
  return {
    nextUrl: new URL(url),
    headers: new Headers(headers),
  };
}

describe('claim route Casper x402 integration', () => {
  it('returns Casper PaymentRequirements with HTTP 402 when chain=casper has no payment header', async () => {
    const { POST, calls } = loadRouteWithMocks();

    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/42/claim?chain=casper'),
      { params: Promise.resolve({ id: '42' }) }
    );
    const body = await response.json();

    assert.equal(response.status, 402);
    assert.equal(body.error, 'Missing x-payment header');
    assert.equal(body.accepts.length, 1);
    assert.equal(body.accepts[0].network, 'casper:casper');
    assert.equal(body.accepts[0].maxAmountRequired, '10000000');
    assert.equal(body.accepts[0].asset, 'hash-wcspr-token');
    assert.equal(calls.createClient.length, 1);
    assert.equal(calls.createClient[0].chainName, 'casper-test');
    assert.equal(calls.buildRequirements.length, 1);
    assert.equal(calls.verify.length, 0);
    assert.equal(calls.baseHandler, 0);
  });

  it('accepts x-chain: casper, verifies and settles via facilitator, then returns Casper mint instructions', async () => {
    const { POST, calls } = loadRouteWithMocks();

    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/43/claim', {
        'x-chain': 'casper',
        'x-payment': 'signed-casper-x402-payment',
      }),
      { params: Promise.resolve({ id: '43' }) }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.chain, 'casper');
    assert.equal(body.payment.settled, true);
    assert.equal(body.payment.txHash, 'deploy-hash-123');
    assert.equal(body.instructions.step2_claim.entryPoint, 'claim');
    assert.equal(body.instructions.step2_claim.args.token_id, 43);
    assert.equal(calls.verify.length, 1);
    assert.equal(calls.verify[0].paymentHeader, 'signed-casper-x402-payment');
    assert.equal(calls.settle.length, 1);
    assert.equal(calls.buildInstructions.length, 1);
    assert.equal(calls.baseHandler, 0);
  });

  it('keeps Base claims on the existing x402-next handler by default', async () => {
    const { POST, calls } = loadRouteWithMocks();

    const response = await POST(
      requestFor('https://tiles.bot/api/tiles/44/claim'),
      { params: Promise.resolve({ id: '44' }) }
    );
    const body = await response.json();

    assert.equal(response.status, 209);
    assert.equal(body.chain, 'base');
    assert.equal(calls.baseHandler, 1);
    assert.equal(calls.createClient.length, 0);
  });
});
