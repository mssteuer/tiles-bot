const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// — Bonding Curve Formula Parity Tests
// Base keeps the original USDC curve. Casper uses the same exponential multiplier,
// but starts at 5 CSPR instead of 0.01 CSPR.
// These are pure math tests — no DB needed.

const START_PRICES = { base: 0.01, casper: 5 };

function bondingCurvePrice(totalMinted, chain = 'base') {
  return START_PRICES[chain] * Math.exp(Math.log(11111) * totalMinted / 65536);
}

function batchPrice(startMinted, count, chain = 'base') {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += bondingCurvePrice(startMinted + i, chain);
  }
  return total;
}

describe('bonding curve formula verification', () => {
  it('first tile costs ~$0.01', () => {
    const price = bondingCurvePrice(0);
    assert.ok(Math.abs(price - 0.01) < 0.001, `First tile: expected ~$0.01, got $${price}`);
  });

  it('last tile costs ~$111.11', () => {
    const price = bondingCurvePrice(65535);
    assert.ok(Math.abs(price - 111.11) < 0.1, `Last tile: expected ~$111.11, got $${price}`);
  });

  it('midpoint tile costs ~$1.05', () => {
    const price = bondingCurvePrice(32768);
    assert.ok(price > 0.5 && price < 2.0, `Midpoint: expected ~$1.05, got $${price}`);
  });

  it('formula is monotonically increasing', () => {
    let prev = bondingCurvePrice(0);
    for (let i = 1000; i <= 65535; i += 1000) {
      const curr = bondingCurvePrice(i);
      assert.ok(curr > prev, `Price at ${i} (${curr}) should be > price at ${i - 1000} (${prev})`);
      prev = curr;
    }
  });

  it('total sold-out revenue is ~$781K', () => {
    let total = 0;
    for (let i = 0; i < 65536; i++) {
      total += bondingCurvePrice(i);
    }
    // Should be approximately $781K per chain
    assert.ok(total > 700000 && total < 850000, `Total revenue: expected ~$781K, got $${total.toFixed(0)}`);
  });
});

describe('independent per-chain pricing', () => {
  it('Casper starts at 5 CSPR while Base starts at $0.01', () => {
    assert.ok(Math.abs(bondingCurvePrice(0, 'base') - 0.01) < 0.001, 'Base first tile is $0.01');
    assert.ok(Math.abs(bondingCurvePrice(0, 'casper') - 5) < 0.001, 'Casper first tile is 5 CSPR');
  });

  it('same totalMinted uses the same multiplier with chain-specific starts', () => {
    const basePrice = bondingCurvePrice(100, 'base');
    const casperPrice = bondingCurvePrice(100, 'casper');
    assert.ok(Math.abs(casperPrice / basePrice - 500) < 0.001, 'Casper remains 500× Base from its 5 CSPR start');
  });

  it('different totalMinted produces different prices within the same chain', () => {
    const lower = bondingCurvePrice(100, 'casper');
    const higher = bondingCurvePrice(1000, 'casper');
    assert.ok(higher > lower, 'More claimed = higher price');
  });

  it('early mover advantage: new Casper chain starts at 5 CSPR regardless of Base', () => {
    const basePrice = bondingCurvePrice(50000, 'base');
    const casperFirstTile = bondingCurvePrice(0, 'casper');

    assert.ok(basePrice > 10, `Base at 50K should be expensive: $${basePrice.toFixed(2)}`);
    assert.ok(Math.abs(casperFirstTile - 5) < 0.001, 'Casper first tile still 5 CSPR');
  });

  it('batch pricing is independent per chain', () => {
    const baseBatch = batchPrice(1000, 5, 'base');
    const casperBatch = batchPrice(100, 5, 'casper');
    assert.ok(casperBatch > baseBatch, 'Casper batch is higher because Casper starts at 5 CSPR');
  });

  it('formula reaches each chain-specific max at 65535 independently', () => {
    const baseMaxPrice = bondingCurvePrice(65535, 'base');
    const casperMaxPrice = bondingCurvePrice(65535, 'casper');
    assert.ok(Math.abs(baseMaxPrice - 111.11) < 0.1, `Base max price: ~$111.11, got $${baseMaxPrice.toFixed(2)}`);
    assert.ok(Math.abs(casperMaxPrice - 55555) < 50, `Casper max price: ~55,555 CSPR, got ${casperMaxPrice.toFixed(2)}`);
  });
});

describe('bonding curve matches Solidity contract', () => {
  it('uses same constants as MillionBotHomepage.sol', () => {
    // Solidity: LN_MAX_PRICE_PER_TILE = 9315160000000000000 / 65536 = 142143249511718
    // JS: Math.log(11111) = 9.31516...
    // The /65536 division happens at query time in both
    const jsLnMaxPrice = Math.log(11111);
    const solLnMaxPrice = 9.315160000000; // 9315160000000000000 / 1e18

    assert.ok(
      Math.abs(jsLnMaxPrice - solLnMaxPrice) < 0.001,
      `JS ln(11111)=${jsLnMaxPrice} should match Solidity constant ~${solLnMaxPrice}`
    );
  });

  it('price range matches contract NatSpec: $0.01 to $111.11', () => {
    const minPrice = bondingCurvePrice(0);
    const maxPrice = bondingCurvePrice(65535);

    // Contract NatSpec: "Range: $0.01 at tile 0 -> $111.11 at tile 65,535"
    assert.ok(Math.abs(minPrice - 0.01) < 0.001, `Min price should be $0.01, got $${minPrice}`);
    assert.ok(Math.abs(maxPrice - 111.11) < 0.1, `Max price should be ~$111.11, got $${maxPrice.toFixed(2)}`);
  });

  it('total supply matches: 256 * 256 = 65536', () => {
    const GRID_SIZE = 256;
    const MAX_SUPPLY = GRID_SIZE * GRID_SIZE;
    assert.equal(MAX_SUPPLY, 65536);
  });
});
