# CEP-95/96 NFT Contract for tiles.bot on Casper — Design Spec

> **Task:** CCC #1717 — Build CEP-95/96 NFT contract via Odra for Casper

## Goal

Build a Casper 2.0 smart contract using the Odra framework that implements the tiles.bot NFT grid — a 256×256 canvas (65,536 tiles) where AI agents claim their spot. Each tile is a CEP-95 NFT, priced via an exponential bonding curve, purchasable with wCSPR (CEP-18 token) to support x402 agentic payments.

## Architecture

The contract composes Odra's built-in modules (Cep95, Cep96, Ownable, Pauseable) with custom logic for pricing, payment, and batch minting. It is fully self-contained — no external oracle or server dependency for pricing. The frontend/SDK handles wrapping native CSPR to wCSPR before interacting with the contract.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tile ID model | User-chosen (0-65535) | Grid position IS the product; agents pick their spot |
| Bonding curve | Independent per chain | Eliminates cross-chain oracle complexity |
| Curve formula | Same as Base: exp(ln(11111) × totalMinted / 65536) / 100 | Consistent branding, C option |
| Payment token | wCSPR only (CEP-18) | Required for x402 (approve/transferFrom pattern) |
| Wrapping | Frontend responsibility | Keeps contract surface minimal |
| Batch limit | 100 tiles max | Prevents gas limit issues on Casper |
| Batch pricing | Incremental (each tile priced at its position) | Fair, matches Base |
| On-chain metadata | URI pointer only (via token_metadata) | Rich data lives in API; NFT changes frequently |
| Access control | Single owner (Ownable) | Simple; transfer_ownership available if needed |
| Pause scope | Claims only; admin ops unaffected | Can halt sales without locking admin out |
| Reentrancy | #[odra(non_reentrant)] on claim/batch_claim/withdraw | Protects against callback attacks via wCSPR |
| Treasury withdrawal | wCSPR, optional amount (0 = all) | Admin unwraps separately if needed |
| wCSPR address | Constructor parameter | Works on testnet + mainnet without recompilation |

## Contract Structure

```rust
#[odra::module]
pub struct TilesBotNft {
    // Standard modules
    cep95: SubModule<Cep95>,
    cep96: SubModule<Cep96>,
    ownable: SubModule<Ownable>,
    pauseable: SubModule<Pauseable>,

    // Custom state
    total_minted: Var<u64>,
    wcspr_address: Var<Address>,
    treasury: Var<Address>,
}
```

## Entry Points

### Constructor
```
init(
    name: String,              // "TilesBot"
    symbol: String,            // "TILE"
    wcspr_address: Address,    // wCSPR CEP-18 contract
    treasury: Address,         // Treasury wallet for withdrawals
    contract_name: Option<String>,
    contract_description: Option<String>,
    contract_icon_uri: Option<String>,
    contract_project_uri: Option<String>,
)
```

### Claim (single tile)
```
#[odra(non_reentrant)]
claim(token_id: U256)
```
- Requires: not paused, token_id < 65536, token not already minted
- Computes price from bonding curve using current total_minted
- Calls wCSPR.transfer_from(caller, self, price)
- Calls cep95.raw_mint(caller, token_id, metadata=[("uri", "")])
- Increments total_minted
- Emits TileClaimed event

### Batch Claim
```
#[odra(non_reentrant)]
batch_claim(token_ids: Vec<U256>)
```
- Requires: not paused, token_ids.len() <= 100, all IDs < 65536, none already minted
- Loops: for each token_id, compute price (incremental), sum total
- Single wCSPR.transfer_from(caller, self, total_sum)
- Loop: raw_mint each tile
- Increments total_minted by batch size
- Emits TileClaimed event per tile

### Set Tile URI
```
set_tile_uri(token_id: U256, uri: String)
```
- Requires: caller == owner_of(token_id)
- Updates token metadata key "uri" to new value

### Views
```
current_price() -> U256          // Current price in wCSPR motes
total_minted() -> u64            // Number of tiles minted
price_for_batch(count: u64) -> U256  // Total cost for next `count` tiles
is_paused() -> bool
```

### Admin
```
pause()                          // Owner only
unpause()                        // Owner only
withdraw(amount: U256)           // Owner only, non_reentrant; 0 = withdraw all
transfer_ownership(new_owner)    // From Ownable
```

### Delegated (CEP-95 standard)
```
name, symbol, balance_of, owner_of, transfer_from, safe_transfer_from,
approve, revoke_approval, approved_for, approve_for_all,
revoke_approval_for_all, is_approved_for_all, token_metadata
```

### Delegated (CEP-96 standard)
```
contract_name, contract_description, contract_icon_uri, contract_project_uri
```

## Bonding Curve Implementation

Formula: `price_motes = BASE_PRICE * exp(ln(11111) * total_minted / 65536)`

Where BASE_PRICE = 10_000_000 motes (0.01 CSPR, 9 decimal places).

### Fixed-Point Math Strategy

Implement 64.64 fixed-point arithmetic in Rust (same approach as Solidity's ABDKMath64x64):
- Represent numbers as i128 where the value = raw / 2^64
- Implement `exp_2(x)` using: integer part via bit shift, fractional part via polynomial approximation
- Implement `exp(x)` as `exp_2(x / ln(2))`
- Implement `ln(x)` using bit manipulation + polynomial
- Pre-compute `LN_11111` as a constant (ln(11111) ≈ 9.3155 → fixed-point constant)

This approach:
- Is deterministic and gas-efficient
- Matches the Solidity implementation's precision
- Requires no external dependencies (pure Rust)
- Can be unit-tested for exact price parity with the Base contract

### Price Range

| Total Minted | Price (CSPR) | Price (motes) |
|---|---|---|
| 0 | 0.01 | 10,000,000 |
| 6,553 | ~0.025 | ~25,000,000 |
| 16,384 | ~0.10 | ~100,000,000 |
| 32,768 | ~1.05 | ~1,054,000,000 |
| 49,152 | ~11.11 | ~11,110,000,000 |
| 65,536 | 111.11 | 111,110,000,000 |

## Custom Events

```rust
#[odra::event]
pub struct TileClaimed {
    pub owner: Address,
    pub token_id: U256,
    pub price: U256,
}

#[odra::event]
pub struct TreasuryWithdrawal {
    pub to: Address,
    pub amount: U256,
}
```

## Error Codes

```rust
#[odra::odra_error]
pub enum TilesBotError {
    InvalidTokenId = 50_000,      // token_id >= 65536
    BatchTooLarge = 50_001,       // batch > 100
    InsufficientPayment = 50_002, // wCSPR transfer failed
    NotTokenOwner = 50_003,       // caller != owner for set_tile_uri
    MaxSupplyReached = 50_004,    // all 65536 tiles minted
    BatchEmpty = 50_005,          // empty batch array
}
```

## Security Considerations

1. **Reentrancy**: `#[odra(non_reentrant)]` on all entry points that make external calls (claim, batch_claim, withdraw)
2. **Access control**: Ownable.assert_owner() guards admin functions; Pauseable.require_not_paused() guards claims
3. **Integer overflow**: U256 for prices and token IDs; u64 for total_minted (max 65536, well within range)
4. **Batch atomicity**: If any tile in a batch is invalid (already minted, out of range), the entire transaction reverts
5. **Payment ordering**: Transfer payment BEFORE minting (checks-effects-interactions pattern adapted for non-reentrant context)

## File Structure

```
contracts/casper/
├── Cargo.toml
├── Odra.toml
├── rust-toolchain
├── src/
│   ├── lib.rs                    # Module exports
│   ├── tiles_bot_nft.rs          # Main contract
│   ├── bonding_curve.rs          # Fixed-point math + pricing
│   ├── errors.rs                 # Custom error enum
│   └── events.rs                 # Custom events
├── bin/
│   ├── build_contract.rs         # WASM build entry
│   └── build_schema.rs           # Schema generation
└── tests/
    ├── common.rs                 # Shared test setup
    ├── test_claim.rs             # Single claim tests
    ├── test_batch_claim.rs       # Batch claim tests
    ├── test_bonding_curve.rs     # Price computation tests
    ├── test_admin.rs             # Pause/unpause/withdraw tests
    └── test_metadata.rs          # URI and CEP-96 tests
```

## Acceptance Criteria

1. Contract deploys successfully with all parameters
2. Single claim mints the correct tile ID to the caller after wCSPR payment
3. Batch claim (up to 100) mints all tiles with correct incremental pricing
4. Bonding curve prices match the expected formula within 0.001% precision
5. Pausing blocks all claims; unpausing restores them
6. Only the owner can pause/unpause/withdraw
7. Withdrawal sends correct wCSPR amount to treasury
8. set_tile_uri only works for the token owner
9. All CEP-95 standard operations work (transfer, approve, etc.)
10. CEP-96 collection metadata is queryable
11. Reentrancy guard prevents callback attacks
12. All token_ids >= 65536 are rejected
13. Duplicate token_id claims revert
14. Empty batch and batch > 100 revert
15. `cargo test` passes all tests
16. `cargo odra build` produces valid WASM artifact