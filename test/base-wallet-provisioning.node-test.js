const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('Base x402 wallet provisioning script', () => {
  it('prints a dedicated EVM wallet and the exact env vars to wire/fund it', () => {
    const output = execFileSync(process.execPath, ['scripts/provision-base-x402-wallet.js', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {},
    });

    const payload = JSON.parse(output);
    assert.match(payload.address, /^0x[0-9a-fA-F]{40}$/);
    assert.match(payload.privateKey, /^0x[0-9a-fA-F]{64}$/);
    assert.equal(payload.chain, 'base');
    assert.equal(payload.env.CHAIN_BASE_TREASURY, payload.address);
    assert.equal(payload.env.X402_NETWORK, 'base');
    assert.equal(payload.funding.asset, 'ETH');
    assert.equal(payload.funding.network, 'Base');
    assert.match(payload.funding.note, /Fund this wallet/);
  });
});
