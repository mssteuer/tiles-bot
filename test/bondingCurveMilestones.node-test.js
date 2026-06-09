// Bonding curve pricing milestone test
// Verifies Base and Casper bonding curves match documented price milestones.
// Base formula:   price = 0.01 * exp(ln(11111) * totalMinted / 65536)
// Casper formula: price = 5    * exp(ln(11111) * totalMinted / 65536)
//
// These values must stay in sync with docs/CSPR-PRICING-MILESTONES.md.

const assert = require('node:assert/strict');

const TOTAL_TILES = 65536;

function bondingCurvePrice(totalMinted, startPrice = 0.01) {
  return startPrice * Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES);
}

function run() {
  // Milestone: first tile = 0.01
  const first = bondingCurvePrice(0);
  assert.ok(
    Math.abs(first - 0.01) < 0.0001,
    `First tile price should be ~0.01, got ${first}`
  );

  // Milestone: at 1000 claimed = ~0.0115
  const at1000 = bondingCurvePrice(1000);
  assert.ok(
    at1000 > 0.011 && at1000 < 0.012,
    `Price at 1000 should be ~0.0115, got ${at1000}`
  );

  // Milestone: at 25% (16384) = ~0.1027
  const at25pct = bondingCurvePrice(16384);
  assert.ok(
    at25pct > 0.10 && at25pct < 0.11,
    `Price at 25% should be ~0.1027, got ${at25pct}`
  );

  // Milestone: at 50% (32768) = ~1.054
  const at50pct = bondingCurvePrice(32768);
  assert.ok(
    at50pct > 1.0 && at50pct < 1.1,
    `Price at 50% should be ~1.054, got ${at50pct}`
  );

  // Milestone: last tile (65535) = ~111.09
  const last = bondingCurvePrice(65535);
  assert.ok(
    last > 110 && last < 112,
    `Last tile price should be ~111.09, got ${last}`
  );

  // Casper milestones use the same multiplier from a 5 CSPR start.
  const casperFirst = bondingCurvePrice(0, 5);
  assert.ok(
    Math.abs(casperFirst - 5) < 0.0001,
    `Casper first tile price should be ~5, got ${casperFirst}`
  );

  const casperMid = bondingCurvePrice(32768, 5);
  assert.ok(
    casperMid > 525 && casperMid < 530,
    `Casper midpoint should be ~527, got ${casperMid}`
  );

  const casperLast = bondingCurvePrice(65535, 5);
  assert.ok(
    casperLast > 55000 && casperLast < 56000,
    `Casper last tile price should be ~55,555, got ${casperLast}`
  );

  // Monotonically increasing
  let prev = bondingCurvePrice(0);
  for (let i = 1000; i < TOTAL_TILES; i += 1000) {
    const curr = bondingCurvePrice(i);
    assert.ok(
      curr > prev,
      `Price should increase: at ${i} (${curr}) should be > at ${i - 1000} (${prev})`
    );
    prev = curr;
  }

  // Total revenue matches documented ~781,534 CSPR
  let totalRevenue = 0;
  for (let i = 0; i < TOTAL_TILES; i++) {
    totalRevenue += bondingCurvePrice(i);
  }
  assert.ok(
    totalRevenue > 780000 && totalRevenue < 783000,
    `Total revenue should be ~781,534, got ${totalRevenue.toFixed(2)}`
  );

  console.log('bonding curve milestone tests: ok');
}

run();
