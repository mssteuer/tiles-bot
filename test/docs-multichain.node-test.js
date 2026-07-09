const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

async function loadOpenApiSpec() {
  const mod = await import('../src/lib/route-registry.js');
  return mod.buildOpenApiSpec();
}

describe('agentic multi-chain docs', () => {
  it('SKILL.md route documents Casper wallet setup, x402, cspr.live, and keeps Base flow', () => {
    const source = readFileSync(join(ROOT, 'src/app/SKILL.md/route.js'), 'utf8');

    assert.match(source, /Casper Wallet \/ CSPR\.click Setup/);
    assert.match(source, /chain=casper/);
    assert.match(source, /x-payment/i);
    assert.match(source, /cspr\.live/);
    assert.match(source, /CSPR price tiers/);
    assert.match(source, /Approve USDC spending/);
    assert.match(source, /OpenSea \(Base\)/);
  });

  it('llms.txt route declares multi-chain choice, wallets, and payment tokens', () => {
    const source = readFileSync(join(ROOT, 'src/app/llms.txt/route.js'), 'utf8');

    assert.match(source, /Multi-chain/);
    assert.match(source, /Choose chain/);
    assert.match(source, /Base wallet/);
    assert.match(source, /Casper wallet/);
    assert.match(source, /USDC/);
    assert.match(source, /wCSPR/);
  });

  it('OpenClaw skill guide documents Base and Casper claim setup', () => {
    const source = readFileSync(join(ROOT, 'openclaw-skill/SKILL.md'), 'utf8');

    assert.match(source, /Base.*ERC-721 NFTs.*USDC\/x402/s);
    assert.match(source, /Casper.*wCSPR\/x402 claim path/s);
    assert.match(source, /POST \/api\/tiles\/\{id\}\/claim\?chain=base/);
    assert.match(source, /POST \/api\/tiles\/\{id\}\/claim\?chain=casper/);
    assert.match(source, /CSPR\.click \/ Casper public key owner/);
    assert.match(source, /TILES_BOT_CHAIN=<base\|casper>/);
  });

  it('OpenAPI exposes chain selectors, Casper payment schemas, and x402 requirements', async () => {
    const spec = await loadOpenApiSpec();
    const claim = spec.paths['/api/tiles/{id}/claim'].post;
    const register = spec.paths['/api/tiles/{id}/register'].post;
    const checkOwner = spec.paths['/api/tiles/{id}/check-owner'].get;

    assert.equal(spec.info.title, 'tiles.bot Multi-Chain API');
    assert.match(spec.info.description, /Base and Casper/);
    assert.ok(spec.components.schemas.ChainId);
    assert.ok(spec.components.schemas.PaymentRequirements);
    assert.ok(spec.components.schemas.CasperPaymentRequirements);
    assert.ok(spec.components.schemas.CasperClaimInstructions);

    assert.ok(claim.parameters.some(p => p.name === 'chain' && p.in === 'query'));
    assert.ok(claim.responses['402'].content['application/json'].schema.$ref.includes('X402PaymentRequired'));
    assert.ok(register.requestBody.content['application/json'].schema.properties.chain);
    assert.ok(register.responses['202'], 'register documents transient on-chain propagation as 202, not browser-noisy 404');
    assert.ok(checkOwner.parameters.some(p => p.name === 'chain' && p.in === 'query'));
  });
});
