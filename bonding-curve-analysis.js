#!/usr/bin/env node
/**
 * Bonding curve analysis for Million Bot Homepage
 * Grid: 256×256 = 65,536 tiles
 * Price range: $1 → $11,111
 */

const TOTAL_TILES = 256 * 256; // 65,536
const MIN_PRICE = 1;
const MAX_PRICE = 11111;

// --- Curve functions ---
// n = number already minted (0 to TOTAL_TILES-1)

const curves = {
  linear: {
    name: 'Linear',
    formula: 'price = 1 + 11110 × (n / 65536)',
    fn: (n) => MIN_PRICE + (MAX_PRICE - MIN_PRICE) * (n / TOTAL_TILES),
  },
  quadratic: {
    name: 'Quadratic (slow start)',
    formula: 'price = 1 + 11110 × (n / 65536)²',
    fn: (n) => MIN_PRICE + (MAX_PRICE - MIN_PRICE) * Math.pow(n / TOTAL_TILES, 2),
  },
  exponential: {
    name: 'Exponential',
    formula: 'price = e^(ln(11111) × n / 65536)',
    fn: (n) => Math.exp(Math.log(MAX_PRICE) * (n / TOTAL_TILES)),
  },
  sqrt: {
    name: 'Square Root (fast start)',
    formula: 'price = 1 + 11110 × √(n / 65536)',
    fn: (n) => MIN_PRICE + (MAX_PRICE - MIN_PRICE) * Math.sqrt(n / TOTAL_TILES),
  },
  sigmoid: {
    name: 'S-Curve (cheap early, steep late)',
    formula: 'logistic sigmoid remapped to [1, 11111]',
    fn: (n) => {
      const x = 12 * (n / TOTAL_TILES) - 6; // map to [-6, 6]
      const s = 1 / (1 + Math.exp(-x));
      return MIN_PRICE + (MAX_PRICE - MIN_PRICE) * s;
    },
  },
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MILLION BOT HOMEPAGE — BONDING CURVE ANALYSIS');
console.log('  Grid: 256 × 256 = 65,536 tiles');
console.log('  Price range: $1 → $11,111');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const [key, curve] of Object.entries(curves)) {
  let totalRevenue = 0;
  const milestones = {};
  const pctPoints = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1];

  for (let n = 0; n < TOTAL_TILES; n++) {
    const price = curve.fn(n);
    totalRevenue += price;

    // Track milestones
    const pct = (n + 1) / TOTAL_TILES;
    for (const p of pctPoints) {
      if (!milestones[p] && pct >= p) {
        milestones[p] = { n: n + 1, price: price.toFixed(2), cumRevenue: totalRevenue };
      }
    }
  }

  console.log(`\n📈 ${curve.name}`);
  console.log(`   Formula: ${curve.formula}`);
  console.log(`   ┌─────────────┬──────────┬───────────────┬──────────────────┐`);
  console.log(`   │ % Filled    │ Tiles    │ Current Price │ Cumulative Rev   │`);
  console.log(`   ├─────────────┼──────────┼───────────────┼──────────────────┤`);

  for (const p of pctPoints) {
    const m = milestones[p];
    if (m) {
      const pctStr = `${(p * 100).toFixed(0)}%`.padStart(4);
      const tilesStr = m.n.toLocaleString().padStart(8);
      const priceStr = `$${parseFloat(m.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padStart(13);
      const revStr = `$${Math.round(m.cumRevenue).toLocaleString()}`.padStart(16);
      console.log(`   │ ${pctStr}        │${tilesStr} │${priceStr} │${revStr} │`);
    }
  }

  console.log(`   └─────────────┴──────────┴───────────────┴──────────────────┘`);
  console.log(`   💰 TOTAL REVENUE IF SOLD OUT: $${Math.round(totalRevenue).toLocaleString()}`);

  // Price at key tile counts
  const spotChecks = [1, 100, 1000, 5000, 10000, 25000, 50000, 65000, 65535];
  console.log(`\n   Spot prices:`);
  for (const n of spotChecks) {
    if (n < TOTAL_TILES) {
      const p = curve.fn(n);
      console.log(`     Tile #${n.toLocaleString().padStart(6)}: $${p.toFixed(2)}`);
    }
  }
}

// Summary comparison
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('  COMPARISON SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('  Curve             │ First 10% avg │ Last 10% avg  │ Total Revenue');
console.log('  ──────────────────┼───────────────┼───────────────┼──────────────');

for (const [key, curve] of Object.entries(curves)) {
  let first10 = 0, last10 = 0;
  const cutoff10 = Math.floor(TOTAL_TILES * 0.1);
  const cutoff90 = Math.floor(TOTAL_TILES * 0.9);
  let total = 0;

  for (let n = 0; n < TOTAL_TILES; n++) {
    const price = curve.fn(n);
    total += price;
    if (n < cutoff10) first10 += price;
    if (n >= cutoff90) last10 += price;
  }

  const avgFirst = (first10 / cutoff10).toFixed(2);
  const avgLast = (last10 / (TOTAL_TILES - cutoff90)).toFixed(2);
  const name = curve.name.padEnd(18).substring(0, 18);
  console.log(`  ${name} │ $${avgFirst.padStart(11)} │ $${avgLast.padStart(11)} │ $${Math.round(total).toLocaleString().padStart(12)}`);
}

console.log('\n  💡 Recommendation: Exponential or S-Curve');
console.log('     - Keeps first ~50% of tiles under $10 (accessible)');
console.log('     - Creates real scarcity premium for late buyers');
console.log('     - Exponential total: ~$78M (aspirational but meaningful)');
console.log('     - S-Curve total: ~$364M (hockey stick at the end)\n');
