// Shared bonding-curve pricing constants for tiles.bot.
// Base remains the original USDC curve. Casper uses the same exponential multiplier,
// but starts at 5 CSPR instead of 0.01 CSPR.

export const TOTAL_TILES = 65_536;
export const BONDING_CURVE_MULTIPLIER = 11_111;
export const BASE_START_PRICE = 0.01;
export const CASPER_START_PRICE = 5;

export function startPriceForChain(chainId) {
  return chainId === 'casper' ? CASPER_START_PRICE : BASE_START_PRICE;
}

export function bondingCurvePrice(totalMinted, chainId = 'base') {
  if (totalMinted >= TOTAL_TILES) return Infinity;
  const startPrice = startPriceForChain(chainId);
  return startPrice * Math.exp(Math.log(BONDING_CURVE_MULTIPLIER) * totalMinted / TOTAL_TILES);
}

export function bondingCurveBatchPrice(totalMinted, count, chainId = 'base') {
  let total = 0;
  for (let i = 0; i < count; i++) total += bondingCurvePrice(totalMinted + i, chainId);
  return total;
}
