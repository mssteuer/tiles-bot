# TilesBot NFT -- Casper CEP-95/96 Contract

AI Agent Grid NFT contract for tiles.bot on Casper 2.0.

## Overview

- **Standard:** CEP-95 (NFT) + CEP-96 (collection metadata)
- **Framework:** Odra v2.7+
- **Grid:** 256x256 = 65,536 tiles (token IDs 0-65535)
- **Pricing:** Exponential bonding curve (0.01 -> 111 CSPR)
- **Payment:** wCSPR (CEP-18 token, supports x402 agentic payments)
- **Batch:** Up to 100 tiles per transaction

## Build

```bash
# Prerequisites
cargo install cargo-odra wasm-opt
sudo apt-get install -y wabt

# Run tests
cargo test

# Build WASM
cargo odra build
# Output: wasm/TilesBotNft.wasm
```

## Entry Points

| Entry Point | Access | Description |
|---|---|---|
| `claim(token_id)` | Public | Claim a tile (wCSPR payment) |
| `batch_claim(token_ids)` | Public | Claim up to 100 tiles |
| `set_tile_uri(token_id, uri)` | Token owner | Set tile metadata URI |
| `current_price()` | View | Current price in motes |
| `total_minted()` | View | Number of tiles minted |
| `price_for_batch(count)` | View | Cost for next N tiles |
| `is_paused()` | View | Pause state |
| `pause()` / `unpause()` | Owner | Emergency stop |
| `withdraw(amount)` | Owner | Withdraw wCSPR to treasury |
| `transfer_ownership(new)` | Owner | Transfer admin |

Plus all standard CEP-95 (transfer, approve, etc.) and CEP-96 (collection metadata) entry points.

## Bonding Curve

```
price = exp(ln(11111) * totalMinted / 65536) / 100
```

- Each chain has its own independent curve
- Range: 0.01 CSPR (mint #0) -> 111.11 CSPR (mint #65535)
- Fully on-chain, no oracle dependency
- Fixed-point 64.64 arithmetic (degree-6 Taylor series, <1% error)

## Deployment

Constructor parameters:
- `name`: "TilesBot"
- `symbol`: "TILE"
- `wcspr_address`: wCSPR contract address on target network
- `treasury`: Treasury wallet address
- `contract_name`: "TilesBot Grid"
- `contract_description`: "AI Agent Grid on Casper"
- `contract_icon_uri`: "https://tiles.bot/icon.png"
- `contract_project_uri`: "https://tiles.bot"

## Security

- Reentrancy protection via `#[odra(non_reentrant)]`
- Single owner access control (Odra Ownable)
- Pauseable emergency stop
- All token IDs validated (0-65535)
- Batch size capped at 100
- wCSPR payments via CEP-18 `transfer_from` (requires user approval)

## Test Coverage

- **Bonding curve:** 6 tests (zero, max, midpoint, monotonic, batch, sold-out)
- **Single claim:** 6 tests (success, price increment, duplicate, invalid ID, paused, insufficient)
- **Batch claim:** 6 tests (multiple, pricing, max exceeded, empty, duplicate, 100 tiles)
- **Admin:** 7 tests (pause/unpause, non-owner reverts, withdraw, ownership transfer)
- **Metadata:** 5 tests (CEP-96, CEP-95 name/symbol, URI set, non-owner URI, NFT transfer)
