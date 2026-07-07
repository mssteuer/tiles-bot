const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

describe('Base x402 claim route wiring', () => {
  it('sources payTo/network from the centralized Base x402 settlement config', () => {
    const source = readFileSync(join(ROOT, 'src/app/api/tiles/[id]/claim/route.js'), 'utf8');

    assert.match(source, /resolveBaseX402Config/);
    assert.match(source, /chainConfig:\s*getChain\('base'\)/);
    assert.match(source, /PAY_TO_ADDRESS\s*=\s*baseX402Config\.payToAddress/);
    assert.match(source, /X402_NETWORK\s*=\s*baseX402Config\.network/);
    assert.doesNotMatch(source, /X402_PAY_TO_ADDRESS\s*\|\|\s*'0x0000000000000000000000000000000000000000'/);
    assert.doesNotMatch(source, /X402_NETWORK\s*\|\|\s*'base-sepolia'/);
  });
});
