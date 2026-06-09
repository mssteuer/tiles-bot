# CSPR Pricing Milestones

> Bonding curve pricing for tiles on the **Casper** chain.
> Base and Casper run independent curves with the same 11,111× multiplier but different starting prices.

## Formula

```text
price_cspr = 5 × exp(ln(11111) × totalMinted / 65536)
```

- **Range:** 5 CSPR (first tile) → ~55,547 CSPR (last tile)
- **On-chain unit:** wCSPR motes (1 CSPR = 1,000,000,000 motes)
- **First tile cost:** 5,000,000,000 motes (5 CSPR)
- **Pricing is fully on-chain** — no oracle or server dependency

## Key Milestones

| Tiles Claimed | % Sold | Price (CSPR) | Price (motes) |
|---------------|--------|--------------|---------------|
| 0             | 0%     | 5.0000       | 5,000,000,000 |
| 100           | 0.2%   | 5.0716       | 5,071,580,621 |
| 1,000         | 1.5%   | 5.7637       | 5,763,725,620 |
| 5,000         | 7.6%   | 10.1774      | 10,177,391,327 |
| 10,000        | 15.3%  | 20.7159      | 20,715,858,844 |
| 16,384        | 25%    | 51.3344      | 51,334,376,467 |
| 32,768        | 50%    | 527.0436     | 527,043,641,457 |
| 50,000        | 76.3%  | 6,104.2835   | 6,104,283,541,809 |
| 60,000        | 91.6%  | 25,291.0952  | 25,291,095,239,434 |
| 65,000        | 99.2%  | 51,479.4747  | 51,479,474,667,576 |
| 65,535        | 100%   | 55,547.1036  | 55,547,103,631,190 |

## Revenue Projections (Casper)

| Scenario           | Revenue (CSPR) |
|--------------------|----------------|
| First 1,000 tiles  | ~5,372         |
| First 10,000 tiles | ~110,553       |
| All 65,536 tiles   | ~390,767,159   |

## Average Prices

| Range         | Avg Price (CSPR) |
|---------------|------------------|
| First 1,000   | ~5.37            |
| First 10,000  | ~11.06           |

## Comparison with Base Chain

Both chains use the **same multiplier**. The difference is denomination and starting price:

| Property       | Base             | Casper           |
|----------------|------------------|------------------|
| Payment token  | USDC (6 decimals)| wCSPR (9 decimals / motes) |
| First tile     | $0.01 USDC       | 5 CSPR           |
| Last tile      | ~$111.11 USDC    | ~55,547 CSPR     |
| Curve          | Independent      | Independent      |
| On-chain       | Solidity ERC-721 | Rust CEP-95 (Odra) |

## Notes

- The curves are **independent**: claiming tiles on Base does not affect Casper pricing, and vice versa.
- Tile IDs are in a **shared namespace** — a tile ID can only exist on one chain.
- The contract computes prices on-chain via the bonding curve. No fixed tier lookup table is needed.
- For frontend display, use `getCurrentPriceByChain('casper')` from `src/lib/db.js`.
