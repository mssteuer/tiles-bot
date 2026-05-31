import assert from 'node:assert/strict';
import test from 'node:test';
import { callTool, serverVersion, tools } from '../src/index.ts';

function tool(name: string) {
  const match = tools.find((entry) => entry.name === name);
  assert.ok(match, `missing tool ${name}`);
  return match;
}

function parseToolText(result: any) {
  assert.equal(result.content?.[0]?.type, 'text');
  return JSON.parse(result.content[0].text);
}

function createFetchRecorder(payload: any = { ok: true }) {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}

test('MCP package exposes version 0.3.0 and multi-chain discovery tools', () => {
  assert.equal(serverVersion, '0.3.0');
  assert.ok(tool('get-supported-chains'));
  assert.ok(tool('casper-claim-tile'));
  assert.ok(tool('get-chain-config'));
});

test('chain-aware tools accept optional chain without breaking existing required args', () => {
  for (const name of [
    'tiles_claim',
    'tiles_register',
    'tiles_check_owner',
    'tiles_batch_register',
    'tiles_get_info',
    'tiles_get_grid',
    'tiles_get_stats',
  ]) {
    const schema: any = tool(name).inputSchema;
    assert.deepEqual(schema.properties.chain.enum, ['base', 'casper'], `${name} chain enum`);
    assert.equal(schema.properties.chain.default, 'base', `${name} defaults to Base`);
    assert.ok(!schema.required?.includes('chain'), `${name} chain is optional`);
  }
});

test('existing claim flow defaults to Base and sends the chain to the API', async () => {
  const { calls, fetchImpl } = createFetchRecorder({ ok: true });

  await callTool('tiles_claim', { tileId: 42, wallet: '0xabc' }, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tiles.bot/api/tiles/42/claim?chain=base');
  assert.equal(calls[0].options?.method, 'POST');
  assert.equal(JSON.parse(String(calls[0].options?.body)).chain, 'base');
});

test('Casper claim helper targets Casper claim flow', async () => {
  const { calls, fetchImpl } = createFetchRecorder({ ok: true, chain: 'casper' });

  await callTool('casper-claim-tile', { tileId: 7, wallet: '01'.padEnd(66, 'a') }, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tiles.bot/api/tiles/7/claim?chain=casper');
  assert.equal(JSON.parse(String(calls[0].options?.body)).chain, 'casper');
});

test('chain-specific register, owner, grid, tile, stats, and batch-register calls propagate chain', async () => {
  const { calls, fetchImpl } = createFetchRecorder({ ok: true });

  await callTool('tiles_register', { tileId: 1, wallet: '0xabc', txHash: '0x123', chain: 'casper' }, fetchImpl);
  await callTool('tiles_check_owner', { tileId: 1, wallet: '0xabc', chain: 'casper' }, fetchImpl);
  await callTool('tiles_get_info', { tileId: 1, chain: 'casper' }, fetchImpl);
  await callTool('tiles_get_grid', { chain: 'casper' }, fetchImpl);
  await callTool('tiles_get_stats', { chain: 'casper' }, fetchImpl);
  await callTool('tiles_batch_register', { tileIds: [1, 2], wallet: '0xabc', deployHash: 'abc', chain: 'casper' }, fetchImpl);

  assert.equal(calls[0].url, 'https://tiles.bot/api/tiles/1/register');
  assert.equal(JSON.parse(String(calls[0].options?.body)).chain, 'casper');
  assert.equal(calls[1].url, 'https://tiles.bot/api/tiles/1/check-owner?wallet=0xabc&chain=casper');
  assert.equal(calls[2].url, 'https://tiles.bot/api/tiles/1?chain=casper');
  assert.equal(calls[3].url, 'https://tiles.bot/api/grid?chain=casper');
  assert.equal(calls[4].url, 'https://tiles.bot/api/stats?chain=casper');
  assert.equal(calls[5].url, 'https://tiles.bot/api/tiles/batch-register');
  assert.equal(JSON.parse(String(calls[5].options?.body)).chain, 'casper');
});

test('supported chain tools read /api/chains and get-chain-config filters one chain', async () => {
  const payload = {
    defaultChain: 'base',
    chains: {
      base: { id: 'base', name: 'Base', nftContract: '0xbase' },
      casper: { id: 'casper', name: 'Casper', nftContract: 'hash-casper' },
    },
  };
  const { calls, fetchImpl } = createFetchRecorder(payload);

  const supported = parseToolText(await callTool('get-supported-chains', {}, fetchImpl));
  const casper = parseToolText(await callTool('get-chain-config', { chain: 'casper' }, fetchImpl));

  assert.equal(calls[0].url, 'https://tiles.bot/api/chains');
  assert.equal(calls[1].url, 'https://tiles.bot/api/chains');
  assert.deepEqual(supported, payload);
  assert.deepEqual(casper, { defaultChain: 'base', chain: payload.chains.casper });
});
