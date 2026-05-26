# CSPR Pricing Milestones

> Bonding curve pricing for tiles on the **Casper** chain.
> Each chain (Base, Casper) runs an **independent** bonding curve with the same formula but separate `totalMinted` counters.

## Formula

```
price_cspr = exp(ln(11111) × totalMinted / 65536) / 100
```

- **Range:** 0.01 CSPR (first tile) → 111.11 CSPR (last tile)
- **On-chain unit:** wCSPR motes (1 CSPR = 1,000,000,000 motes)
- **First tile cost:** 10,000,000 motes (0.01 CSPR)
- **Pricing is fully on-chain** — no oracle or server dependency

## Key Milestones

| Tiles Claimed | % Sold | Price (CSPR) | Price (motes)      |
|---------------|--------|--------------|---------------------|
| 0             | 0%     | 0.0100       | 10,000,000          |
| 100           | 0.2%   | 0.0101       | 10,143,161          |
| 1,000         | 1.5%   | 0.0115       | 11,527,451          |
| 5,000         | 7.6%   | 0.0204       | 20,354,782          |
| 10,000        | 15.3%  | 0.0414       | 41,431,717          |
| 16,384        | 25%    | 0.1027       | 102,668,752         |
| 32,768        | 50%    | 1.0541       | 1,054,087,282       |
| 50,000        | 76.3%  | 12.2086      | 12,208,567,083      |
| 60,000        | 91.6%  | 50.5822      | 50,582,190,478      |
| 65,000        | 99.2%  | 102.9589     | 102,958,949,335     |
| 65,535        | 100%   | 111.0942     | 111,094,207,262     |

## Revenue Projections (per chain)

| Scenario           | Revenue (CSPR) |
|--------------------|----------------|
| First 1,000 tiles  | ~10.74         |
| First 10,000 tiles | ~221           |
| All 65,536 tiles   | ~781,534       |

## Average Prices

| Range         | Avg Price (CSPR) |
|---------------|------------------|
| First 1,000   | ~0.0107          |
| First 10,000  | ~0.0221          |

## Comparison with Base Chain

Both chains use the **same formula**. The difference is denomination:

| Property       | Base             | Casper           |
|----------------|------------------|------------------|
| Payment token  | USDC (6 decimals)| wCSPR (9 decimals / motes) |
| First tile     | $0.01 USDC       | 0.01 CSPR        |
| Last tile      | $111.11 USDC     | 111.11 CSPR      |
| Curve          | Independent      | Independent      |
| On-chain       | Solidity ERC-721 | Rust CEP-95 (Odra) |

## Notes

- The curves are **independent**: claiming tiles on Base does not affect Casper pricing, and vice versa.
- Tile IDs are in a **shared namespace** — a tile ID can only exist on one chain.
- The contract computes prices on-chain via the bonding curve. No fixed tier lookup table is needed.
- For frontend display, use `getCurrentPriceByChain('casper')` from `src/lib/db.js`.
