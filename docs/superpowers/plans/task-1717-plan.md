# CEP-95/96 NFT Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the tiles.bot CEP-95/96 NFT contract on Casper 2.0 using the Odra framework, with bonding curve pricing, wCSPR payments, batch minting, and admin controls.

**Architecture:** Compose Odra's built-in modules (Cep95, Cep96, Ownable, Pauseable) with custom logic for pricing (fixed-point exponential bonding curve), payment (wCSPR CEP-18 transferFrom), and batch operations. Contract is self-contained with no external oracle dependency.

**Tech Stack:** Rust, Odra framework (v2.7.0+), cargo-odra, wasm-opt, wasm-strip (wabt), Casper 2.0 target

---

## Prerequisites

Before starting any task, ensure the build environment is ready:

```bash
# Verify toolchain
which cargo-odra || cargo install cargo-odra
which wasm-opt || cargo install wasm-opt
which wasm-strip || sudo apt-get install -y wabt
rustup target add wasm32-unknown-unknown
```

Working directory: `/home/jeanclaude/workspace/million-bot-homepage/contracts/casper`

---

### Task 1: Project Scaffold

**Files:**
- Create: `contracts/casper/Cargo.toml`
- Create: `contracts/casper/Odra.toml`
- Create: `contracts/casper/rust-toolchain`
- Create: `contracts/casper/src/lib.rs`
- Create: `contracts/casper/bin/build_contract.rs`
- Create: `contracts/casper/bin/build_schema.rs`

- [ ] **Step 1: Create directory structure**

```bash
cd /home/jeanclaude/workspace/million-bot-homepage
mkdir -p contracts/casper/src contracts/casper/bin contracts/casper/tests
```

- [ ] **Step 2: Create Cargo.toml**

```toml
[package]
name = "tiles-bot-nft"
version = "0.1.0"
edition = "2021"

[dependencies]
odra = { version = "2.7", default-features = false }
odra-modules = { version = "2.7", default-features = false }

[dev-dependencies]
odra-test = "2.7"

[features]
default = []

[[bin]]
name = "build_contract"
path = "bin/build_contract.rs"

[[bin]]
name = "build_schema"
path = "bin/build_schema.rs"
```

- [ ] **Step 3: Create Odra.toml**

```toml
[odra]
name = "tiles_bot_nft"
module = "TilesBotNft"
```

- [ ] **Step 4: Create rust-toolchain**

```
nightly
```

- [ ] **Step 5: Create bin/build_contract.rs**

```rust
fn main() {
    tiles_bot_nft::build_contract();
}
```

- [ ] **Step 6: Create bin/build_schema.rs**

```rust
fn main() {
    tiles_bot_nft::build_schema();
}
```

- [ ] **Step 7: Create src/lib.rs (minimal, exports only)**

```rust
#![no_std]

extern crate alloc;

pub mod errors;
pub mod events;
pub mod bonding_curve;
pub mod tiles_bot_nft;

pub use tiles_bot_nft::TilesBotNft;

#[cfg(not(target_arch = "wasm32"))]
pub fn build_contract() {
    use odra::contract_def::HasIdent;
    let paths = odra::build_artifacts(TilesBotNft::ident());
    println!("Contract built: {:?}", paths);
}

#[cfg(not(target_arch = "wasm32"))]
pub fn build_schema() {
    odra::build_schema::<TilesBotNft>();
}
```

- [ ] **Step 8: Verify compilation (will fail until other files exist — just confirm Cargo.toml resolves deps)**

```bash
cd contracts/casper
cargo check 2>&1 | head -20
```

Expected: dependency resolution succeeds, errors about missing modules (not dep errors)

- [ ] **Step 9: Commit**

```bash
git add contracts/casper/Cargo.toml contracts/casper/Odra.toml contracts/casper/rust-toolchain
git add contracts/casper/src/lib.rs contracts/casper/bin/
git commit -m "feat(casper): scaffold Odra NFT contract project"
```

---

### Task 2: Error and Event Definitions

**Files:**
- Create: `contracts/casper/src/errors.rs`
- Create: `contracts/casper/src/events.rs`

- [ ] **Step 1: Create src/errors.rs**

```rust
use odra::prelude::*;

/// Custom errors for the TilesBot NFT contract.
#[odra::odra_error]
pub enum TilesBotError {
    /// Token ID must be < 65536
    InvalidTokenId = 50_000,
    /// Batch size exceeds maximum of 100
    BatchTooLarge = 50_001,
    /// wCSPR transfer_from failed (insufficient allowance or balance)
    InsufficientPayment = 50_002,
    /// Caller is not the token owner (for set_tile_uri)
    NotTokenOwner = 50_003,
    /// All 65536 tiles have been minted
    MaxSupplyReached = 50_004,
    /// Batch claim array is empty
    BatchEmpty = 50_005,
}
```

- [ ] **Step 2: Create src/events.rs**

```rust
use odra::casper_types::U256;
use odra::prelude::*;

/// Emitted when a tile is claimed (purchased and minted).
#[odra::event]
pub struct TileClaimed {
    /// The address of the new tile owner.
    pub owner: Address,
    /// The tile token ID (0-65535).
    pub token_id: U256,
    /// The price paid in wCSPR motes.
    pub price: U256,
}

/// Emitted when the admin withdraws wCSPR from the contract.
#[odra::event]
pub struct TreasuryWithdrawal {
    /// The treasury address receiving the funds.
    pub to: Address,
    /// The amount withdrawn in wCSPR motes.
    pub amount: U256,
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd contracts/casper
cargo check
```

Expected: may still fail on lib.rs imports (bonding_curve, tiles_bot_nft not yet created), but errors.rs and events.rs should parse cleanly

- [ ] **Step 4: Commit**

```bash
git add contracts/casper/src/errors.rs contracts/casper/src/events.rs
git commit -m "feat(casper): add custom error codes and events"
```

---

### Task 3: Bonding Curve (Fixed-Point Math)

**Files:**
- Create: `contracts/casper/src/bonding_curve.rs`
- Create: `contracts/casper/tests/test_bonding_curve.rs`

- [ ] **Step 1: Write the bonding curve tests first (TDD)**

Create `contracts/casper/tests/test_bonding_curve.rs`:

```rust
//! Tests for the bonding curve pricing logic.
//! Formula: price_motes = 10_000_000 * exp(ln(11111) * total_minted / 65536)
//! Range: 0.01 CSPR (10M motes) at mint 0 → 111.11 CSPR (111.11B motes) at mint 65535

#[cfg(test)]
mod tests {
    use tiles_bot_nft::bonding_curve;

    #[test]
    fn price_at_zero_mints() {
        let price = bonding_curve::compute_price(0);
        // At 0 mints, price should be ~10_000_000 motes (0.01 CSPR)
        // Allow 0.1% tolerance for fixed-point rounding
        let expected: u128 = 10_000_000;
        let tolerance = expected / 1000; // 0.1%
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 0 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn price_at_max_mints() {
        let price = bonding_curve::compute_price(65535);
        // At 65535 mints, price should be ~111_110_000_000 motes (111.11 CSPR)
        let expected: u128 = 111_110_000_000;
        let tolerance = expected / 100; // 1% tolerance at the high end
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 65535 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn price_is_monotonically_increasing() {
        let mut prev = bonding_curve::compute_price(0);
        for i in (1..65536).step_by(100) {
            let current = bonding_curve::compute_price(i);
            assert!(
                current >= prev,
                "Price decreased at mint {}: {} < {}",
                i,
                current,
                prev
            );
            prev = current;
        }
    }

    #[test]
    fn price_at_midpoint() {
        let price = bonding_curve::compute_price(32768);
        // At midpoint: exp(ln(11111) * 0.5) = sqrt(11111) ≈ 105.41
        // price = 0.01 * 105.41 ��� 1.054 CSPR ≈ 1_054_000_000 motes
        let expected: u128 = 1_054_000_000;
        let tolerance = expected / 50; // 2% tolerance
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 32768 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn batch_price_sums_correctly() {
        let start = 100u64;
        let count = 10u64;
        let batch_total = bonding_curve::compute_batch_price(start, count);

        let mut manual_sum: u128 = 0;
        for i in 0..count {
            manual_sum += bonding_curve::compute_price(start + i);
        }

        assert_eq!(
            batch_total, manual_sum,
            "Batch price {} != manual sum {}",
            batch_total, manual_sum
        );
    }

    #[test]
    fn price_at_max_supply_returns_max() {
        // At 65536 (beyond max index), should return u128::MAX or panic-safe sentinel
        let price = bonding_curve::compute_price(65536);
        assert_eq!(price, u128::MAX);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd contracts/casper
cargo test test_bonding_curve 2>&1 | tail -10
```

Expected: FAIL — `bonding_curve` module not found

- [ ] **Step 3: Implement the bonding curve module**

Create `contracts/casper/src/bonding_curve.rs`:

```rust
//! Fixed-point exponential bonding curve for tiles.bot pricing.
//!
//! Formula: price_motes = BASE_PRICE * exp(LN_11111 * total_minted / MAX_SUPPLY)
//!
//! Uses 64.64 fixed-point arithmetic (i128 where value = raw / 2^64).
//! This is a Rust port of Solidity's ABDKMath64x64 approach.

use odra::prelude::*;

/// Maximum number of tiles (256 * 256 grid)
pub const MAX_SUPPLY: u64 = 65_536;

/// Base price in motes: 0.01 CSPR = 10_000_000 motes (9 decimal places)
pub const BASE_PRICE_MOTES: u128 = 10_000_000;

/// Maximum batch size
pub const MAX_BATCH_SIZE: u64 = 100;

// — Fixed-point constants (64.64 format: value * 2^64)

/// ln(11111) ≈ 9.31556... in 64.64 fixed-point
/// Computed as: round(9.315557885 * 2^64) = 171_846_002_439_862_869_197
const LN_11111_FP: i128 = 171_846_002_439_862_869_197;

/// ln(2) ≈ 0.693147... in 64.64 fixed-point
const LN_2_FP: i128 = 12_786_308_645_202_655_660;

/// 1.0 in 64.64 fixed-point
const ONE_FP: i128 = 1_i128 << 64;

/// Compute the price in motes for the `n`th mint (0-indexed).
///
/// Returns u128::MAX if n >= MAX_SUPPLY (sentinel for "sold out").
pub fn compute_price(total_minted: u64) -> u128 {
    if total_minted >= MAX_SUPPLY {
        return u128::MAX;
    }

    // exponent = LN_11111 * total_minted / MAX_SUPPLY (in 64.64)
    let exponent = fp_mul(LN_11111_FP, fp_from_fraction(total_minted as i128, MAX_SUPPLY as i128));

    // multiplier = exp(exponent) (in 64.64)
    let multiplier = fp_exp(exponent);

    // price = BASE_PRICE * multiplier
    // Convert multiplier from 64.64 to integer, multiply by BASE_PRICE
    let price = fp_to_u128(fp_mul(fp_from_u128(BASE_PRICE_MOTES), multiplier));

    // Ensure minimum price of 1 mote
    if price == 0 { 1 } else { price }
}

/// Compute the total price for a batch of `count` tiles starting at `total_minted`.
pub fn compute_batch_price(total_minted: u64, count: u64) -> u128 {
    let mut total: u128 = 0;
    for i in 0..count {
        let price = compute_price(total_minted + i);
        if price == u128::MAX {
            return u128::MAX; // Overflow sentinel
        }
        total = total.saturating_add(price);
    }
    total
}

// — Fixed-point arithmetic (64.64 format)

/// Convert a u128 integer to 64.64 fixed-point.
fn fp_from_u128(x: u128) -> i128 {
    (x as i128) << 64
}

/// Convert a fraction (numerator/denominator) to 64.64 fixed-point.
fn fp_from_fraction(num: i128, denom: i128) -> i128 {
    // (num << 64) / denom
    ((num as i128) << 64) / denom
}

/// Multiply two 64.64 fixed-point numbers.
fn fp_mul(a: i128, b: i128) -> i128 {
    // (a * b) >> 64
    ((a as i128) * (b as i128)) >> 64
}

/// Convert 64.64 fixed-point to u128 (truncates fractional part).
fn fp_to_u128(x: i128) -> u128 {
    if x < 0 {
        0
    } else {
        (x >> 64) as u128
    }
}

/// Compute exp(x) for 64.64 fixed-point x.
///
/// Uses the identity: exp(x) = 2^(x / ln(2))
/// Then computes 2^y for the result.
fn fp_exp(x: i128) -> i128 {
    // x / ln(2) to get the base-2 exponent
    let y = fp_div(x, LN_2_FP);
    fp_exp2(y)
}

/// Divide two 64.64 fixed-point numbers.
fn fp_div(a: i128, b: i128) -> i128 {
    // (a << 64) / b
    ((a as i128) << 64) / b
}

/// Compute 2^x for 64.64 fixed-point x.
///
/// Splits x into integer part (bit shift) and fractional part (polynomial approximation).
/// Supports x in range [0, 63] which is sufficient for our use case
/// (max exponent = ln(11111)/ln(2) ≈ 13.44).
fn fp_exp2(x: i128) -> i128 {
    if x < 0 {
        // 2^(-|x|) = 1 / 2^|x|
        let pos_result = fp_exp2(-x);
        if pos_result == 0 {
            return 0;
        }
        return fp_div(ONE_FP, pos_result);
    }

    // Split into integer and fractional parts
    let int_part = (x >> 64) as u32;
    let frac_part = x & ((1_i128 << 64) - 1); // Lower 64 bits

    // Integer part: 2^int_part in 64.64 = 1 << (64 + int_part)
    // But we need to keep it in 64.64 format, so it's (1 << int_part) in 64.64
    let int_result: i128 = ONE_FP << int_part;

    // Fractional part: 2^frac using minimax polynomial approximation
    // For frac in [0, 1), approximate 2^frac using a degree-6 polynomial
    // Coefficients computed for the [0, 1) range in 64.64 format
    let frac_result = exp2_frac(frac_part);

    // Combine: 2^x = 2^int * 2^frac
    fp_mul(int_result, frac_result)
}

/// Approximate 2^x for x in [0, 1) represented as the fractional bits of a 64.64 number.
///
/// Uses a minimax polynomial approximation (degree 6) for 2^x on [0, 1):
/// 2^x ≈ 1 + x*ln(2) + x²*ln(2)²/2! + x³*ln(2)³/3! + ...
///
/// Coefficients in 64.64 fixed-point (pre-computed):
fn exp2_frac(frac: i128) -> i128 {
    // Horner's method with pre-computed coefficients for 2^x on [0,1)
    // These are the Taylor series coefficients of 2^x = exp(x*ln2):
    // c0 = 1.0
    // c1 = ln(2) ≈ 0.6931471805599453
    // c2 = ln(2)^2 / 2 ≈ 0.2402265069591007
    // c3 = ln(2)^3 / 6 ≈ 0.05550410866482158
    // c4 = ln(2)^4 / 24 ≈ 0.009618129107628477
    // c5 = ln(2)^5 / 120 ≈ 0.001333355814642312
    // c6 = ln(2)^6 / 720 �� 0.0001540353039338161

    // In 64.64 fixed-point:
    const C0: i128 = 18_446_744_073_709_551_616; // 1.0
    const C1: i128 = 12_786_308_645_202_655_660; // ln(2)
    const C2: i128 = 4_431_396_893_702_724_196;  // ln(2)^2 / 2
    const C3: i128 = 1_023_870_052_871_026_094;  // ln(2)^3 / 6
    const C4: i128 = 177_449_180_399_498_970;    // ln(2)^4 / 24
    const C5: i128 = 24_597_782_719_177_498;     // ln(2)^5 / 120
    const C6: i128 = 2_841_563_974_498_195;      // ln(2)^6 / 720

    // x is frac (already in 64.64 format, representing a value in [0, 1))
    let x = frac;

    // Horner's method: c0 + x*(c1 + x*(c2 + x*(c3 + x*(c4 + x*(c5 + x*c6)))))
    let mut result = C6;
    result = C5 + fp_mul(result, x);
    result = C4 + fp_mul(result, x);
    result = C3 + fp_mul(result, x);
    result = C2 + fp_mul(result, x);
    result = C1 + fp_mul(result, x);
    result = C0 + fp_mul(result, x);

    result
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd contracts/casper
cargo test test_bonding_curve -- --nocapture
```

Expected: All 6 tests pass. If precision is off, adjust polynomial coefficients or add higher-order terms.

- [ ] **Step 5: Commit**

```bash
git add contracts/casper/src/bonding_curve.rs contracts/casper/tests/test_bonding_curve.rs
git commit -m "feat(casper): implement exponential bonding curve with fixed-point math"
```

---

### Task 4: Main Contract (Core Structure + Init)

**Files:**
- Create: `contracts/casper/src/tiles_bot_nft.rs`
- Modify: `contracts/casper/src/lib.rs` (ensure exports are correct)

- [ ] **Step 1: Write the main contract module**

Create `contracts/casper/src/tiles_bot_nft.rs`:

```rust
//! TilesBot NFT — CEP-95/96 NFT contract for tiles.bot on Casper.
//!
//! A 256×256 grid of NFT tiles priced via an exponential bonding curve.
//! Payment in wCSPR (CEP-18). Supports single and batch claims.

use odra::casper_types::{bytesrepr::Bytes, U256};
use odra::prelude::*;
use odra::ContractRef;
use odra_modules::access::Ownable;
use odra_modules::cep95::{CEP95Interface, Cep95};
use odra_modules::cep96::{Cep96, Cep96ContractMetadata};
use odra_modules::security::Pauseable;

use crate::bonding_curve::{self, MAX_BATCH_SIZE, MAX_SUPPLY};
use crate::errors::TilesBotError;
use crate::events::{TileClaimed, TreasuryWithdrawal};

// — CEP-18 external contract interface for wCSPR interaction

#[odra::external_contract]
trait Cep18Token {
    fn transfer_from(&mut self, owner: Address, recipient: Address, amount: U256);
    fn transfer(&mut self, recipient: Address, amount: U256);
    fn balance_of(&self, address: Address) -> U256;
}

// — Main contract

/// The TilesBot NFT contract.
#[odra::module(events = [TileClaimed, TreasuryWithdrawal], errors = TilesBotError)]
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

#[odra::module]
impl TilesBotNft {
    /// Initialize the contract with all required parameters.
    pub fn init(
        &mut self,
        name: String,
        symbol: String,
        wcspr_address: Address,
        treasury: Address,
        contract_name: Option<String>,
        contract_description: Option<String>,
        contract_icon_uri: Option<String>,
        contract_project_uri: Option<String>,
    ) {
        // Initialize CEP-95 (NFT standard)
        self.cep95.init(name, symbol);

        // Initialize CEP-96 (collection metadata)
        self.cep96.init(
            contract_name,
            contract_description,
            contract_icon_uri,
            contract_project_uri,
        );

        // Initialize access control (deployer = owner)
        self.ownable.init(self.env().caller());

        // Store payment config
        self.wcspr_address.set(wcspr_address);
        self.treasury.set(treasury);
        self.total_minted.set(0);
    }

    // — Claim entry points

    /// Claim a single tile by ID. Caller must have approved wCSPR for the price.
    #[odra(non_reentrant)]
    pub fn claim(&mut self, token_id: U256) {
        self.pauseable.require_not_paused();
        self.validate_token_id(&token_id);

        let total_minted = self.total_minted.get_or_default();
        if total_minted >= MAX_SUPPLY {
            self.env().revert(TilesBotError::MaxSupplyReached);
        }

        // Compute price
        let price_motes = bonding_curve::compute_price(total_minted);
        let price = U256::from(price_motes);

        // Take payment (wCSPR transfer_from)
        let caller = self.env().caller();
        self.take_payment(caller, price);

        // Mint the tile
        let metadata = vec![("uri".to_string(), String::new())];
        self.cep95.raw_mint(caller, token_id, metadata);

        // Update counter
        self.total_minted.set(total_minted + 1);

        // Emit event
        self.env().emit_event(TileClaimed {
            owner: caller,
            token_id,
            price,
        });
    }

    /// Claim multiple tiles in one transaction. Max 100 per batch.
    /// Pricing is incremental (each tile priced at its curve position).
    #[odra(non_reentrant)]
    pub fn batch_claim(&mut self, token_ids: Vec<U256>) {
        self.pauseable.require_not_paused();

        let count = token_ids.len() as u64;
        if count == 0 {
            self.env().revert(TilesBotError::BatchEmpty);
        }
        if count > MAX_BATCH_SIZE {
            self.env().revert(TilesBotError::BatchTooLarge);
        }

        let total_minted = self.total_minted.get_or_default();
        if total_minted + count > MAX_SUPPLY {
            self.env().revert(TilesBotError::MaxSupplyReached);
        }

        // Validate all token IDs first
        for token_id in &token_ids {
            self.validate_token_id(token_id);
        }

        // Compute total batch price (incremental)
        let total_price_motes = bonding_curve::compute_batch_price(total_minted, count);
        let total_price = U256::from(total_price_motes);

        // Take payment (single transfer for entire batch)
        let caller = self.env().caller();
        self.take_payment(caller, total_price);

        // Mint all tiles
        let mut current_minted = total_minted;
        for token_id in &token_ids {
            let price_motes = bonding_curve::compute_price(current_minted);
            let metadata = vec![("uri".to_string(), String::new())];
            self.cep95.raw_mint(caller, *token_id, metadata);

            self.env().emit_event(TileClaimed {
                owner: caller,
                token_id: *token_id,
                price: U256::from(price_motes),
            });

            current_minted += 1;
        }

        // Update counter
        self.total_minted.set(total_minted + count);
    }

    // — Metadata

    /// Set the URI for a tile. Only the token owner can call this.
    pub fn set_tile_uri(&mut self, token_id: U256, uri: String) {
        let caller = self.env().caller();
        let owner = self.cep95.owner_of(token_id);
        if owner != Some(caller) {
            self.env().revert(TilesBotError::NotTokenOwner);
        }
        self.cep95.set_metadata(token_id, vec![("uri".to_string(), uri)]);
    }

    // — View functions

    /// Get the current price for the next tile (in wCSPR motes).
    pub fn current_price(&self) -> U256 {
        let total_minted = self.total_minted.get_or_default();
        U256::from(bonding_curve::compute_price(total_minted))
    }

    /// Get the total number of tiles minted.
    pub fn total_minted(&self) -> u64 {
        self.total_minted.get_or_default()
    }

    /// Get the total price for the next `count` tiles.
    pub fn price_for_batch(&self, count: u64) -> U256 {
        let total_minted = self.total_minted.get_or_default();
        U256::from(bonding_curve::compute_batch_price(total_minted, count))
    }

    // — Admin functions

    /// Pause all claim operations. Owner only.
    pub fn pause(&mut self) {
        self.ownable.assert_owner(&self.env().caller());
        self.pauseable.pause();
    }

    /// Unpause claim operations. Owner only.
    pub fn unpause(&mut self) {
        self.ownable.assert_owner(&self.env().caller());
        self.pauseable.unpause();
    }

    /// Withdraw wCSPR from the contract to the treasury. Owner only.
    /// Pass amount = 0 to withdraw the entire balance.
    #[odra(non_reentrant)]
    pub fn withdraw(&mut self, amount: U256) {
        self.ownable.assert_owner(&self.env().caller());

        let wcspr_address = self.wcspr_address.get().unwrap();
        let treasury = self.treasury.get().unwrap();
        let mut wcspr = Cep18TokenContractRef::new(self.env(), wcspr_address);

        let withdraw_amount = if amount == U256::zero() {
            // Withdraw entire balance
            wcspr.balance_of(self.env().self_address())
        } else {
            amount
        };

        wcspr.transfer(treasury, withdraw_amount);

        self.env().emit_event(TreasuryWithdrawal {
            to: treasury,
            amount: withdraw_amount,
        });
    }

    // — Delegated CEP-95 entry points

    delegate! {
        to self.cep95 {
            fn name(&self) -> String;
            fn symbol(&self) -> String;
            fn balance_of(&self, owner: Address) -> U256;
            fn owner_of(&self, token_id: U256) -> Option<Address>;
            fn safe_transfer_from(&mut self, from: Address, to: Address, token_id: U256, data: Option<Bytes>);
            fn transfer_from(&mut self, from: Address, to: Address, token_id: U256);
            fn approve(&mut self, spender: Address, token_id: U256);
            fn revoke_approval(&mut self, token_id: U256);
            fn approved_for(&self, token_id: U256) -> Option<Address>;
            fn approve_for_all(&mut self, operator: Address);
            fn revoke_approval_for_all(&mut self, operator: Address);
            fn is_approved_for_all(&self, owner: Address, operator: Address) -> bool;
            fn token_metadata(&self, token_id: U256) -> Vec<(String, String)>;
        }
    }

    // — Delegated CEP-96 entry points

    delegate! {
        to self.cep96 {
            fn contract_name(&self) -> Option<String>;
            fn contract_description(&self) -> Option<String>;
            fn contract_icon_uri(&self) -> Option<String>;
            fn contract_project_uri(&self) -> Option<String>;
        }
    }

    // — Delegated Ownable entry points

    delegate! {
        to self.ownable {
            fn get_owner(&self) -> Address;
            fn transfer_ownership(&mut self, new_owner: &Address);
        }
    }
}

// — Private implementation

impl TilesBotNft {
    /// Validate that a token ID is within the valid range (0-65535).
    fn validate_token_id(&self, token_id: &U256) {
        if *token_id >= U256::from(MAX_SUPPLY) {
            self.env().revert(TilesBotError::InvalidTokenId);
        }
    }

    /// Take wCSPR payment from the caller.
    fn take_payment(&self, from: Address, amount: U256) {
        let wcspr_address = self.wcspr_address.get().unwrap();
        let mut wcspr = Cep18TokenContractRef::new(self.env(), wcspr_address);
        // This will revert if allowance is insufficient
        wcspr.transfer_from(from, self.env().self_address(), amount);
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd contracts/casper
cargo check
```

Expected: Clean compilation (or minor type issues to resolve)

- [ ] **Step 3: Commit**

```bash
git add contracts/casper/src/tiles_bot_nft.rs contracts/casper/src/lib.rs
git commit -m "feat(casper): implement main TilesBotNft contract with claim, batch, admin"
```

---

### Task 5: Unit Tests — Single Claim

**Files:**
- Create: `contracts/casper/tests/test_claim.rs`
- Create: `contracts/casper/tests/common.rs`

- [ ] **Step 1: Create shared test helpers**

Create `contracts/casper/tests/common.rs`:

```rust
//! Shared test setup for TilesBot NFT tests.

use odra::casper_types::U256;
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::*;
use tiles_bot_nft::TilesBotNft;
use tiles_bot_nft::tiles_bot_nft::{TilesBotNftHostRef, TilesBotNftInitArgs};

/// Mock wCSPR token address (deploy a CEP-18 token for testing).
/// In tests, we use odra-modules' Cep18Token directly.
use odra_modules::cep18_token::Cep18Token;
use odra_modules::cep18_token::{Cep18TokenHostRef, Cep18TokenInitArgs};

pub const INITIAL_WCSPR_SUPPLY: u64 = 1_000_000_000_000_000; // 1M CSPR in motes

/// Deploy a mock wCSPR token and the TilesBot NFT contract.
/// Returns (env, nft_contract, wcspr_contract, owner, user1, user2)
pub fn setup() -> (HostEnv, TilesBotNftHostRef, Cep18TokenHostRef, Address, Address, Address) {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let user1 = env.get_account(1);
    let user2 = env.get_account(2);

    // Deploy mock wCSPR (CEP-18 token)
    let wcspr = Cep18Token::deploy(
        &env,
        Cep18TokenInitArgs {
            name: "Wrapped CSPR".to_string(),
            symbol: "wCSPR".to_string(),
            decimals: 9,
            initial_supply: U256::from(INITIAL_WCSPR_SUPPLY),
        },
    );

    // Deploy the NFT contract
    let nft = TilesBotNft::deploy(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address: *wcspr.address(),
            treasury: owner,
            contract_name: Some("TilesBot Grid".to_string()),
            contract_description: Some("AI Agent Grid on Casper".to_string()),
            contract_icon_uri: Some("https://tiles.bot/icon.png".to_string()),
            contract_project_uri: Some("https://tiles.bot".to_string()),
        },
    );

    (env, nft, wcspr, owner, user1, user2)
}

/// Give wCSPR to an account and approve the NFT contract to spend it.
pub fn fund_and_approve(
    env: &HostEnv,
    wcspr: &mut Cep18TokenHostRef,
    nft_address: Address,
    user: Address,
    amount: U256,
) {
    // Transfer wCSPR from owner (account 0) to user
    let owner = env.get_account(0);
    env.set_caller(owner);
    wcspr.transfer(user, amount);

    // Approve NFT contract to spend user's wCSPR
    env.set_caller(user);
    wcspr.approve(nft_address, amount);
}
```

- [ ] **Step 2: Write single claim tests**

Create `contracts/casper/tests/test_claim.rs`:

```rust
//! Tests for single tile claiming.

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn claim_single_tile_succeeds() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    // Fund user1 with enough wCSPR
    let fund_amount = U256::from(100_000_000_000u64); // 100 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Claim tile #42 as user1
    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    // Verify ownership
    assert_eq!(nft.owner_of(U256::from(42u64)), Some(user1));
    assert_eq!(nft.balance_of(user1), U256::from(1u64));
    assert_eq!(nft.total_minted(), 1);
}

#[test]
fn claim_increments_price() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64); // 1000 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let price_before = nft.current_price();
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    let price_after = nft.current_price();
    assert!(price_after > price_before, "Price should increase after mint");
}

#[test]
fn claim_duplicate_token_id_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, user2) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user2, fund_amount);

    // user1 claims tile #100
    env.set_caller(user1);
    nft.claim(U256::from(100u64));

    // user2 tries to claim same tile — should revert
    env.set_caller(user2);
    let result = nft.try_claim(U256::from(100u64));
    assert!(result.is_err());
}

#[test]
fn claim_invalid_token_id_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);

    // token_id >= 65536 should fail
    let result = nft.try_claim(U256::from(65536u64));
    assert!(result.is_err());

    // token_id = 65535 should succeed (max valid)
    nft.claim(U256::from(65535u64));
    assert_eq!(nft.owner_of(U256::from(65535u64)), Some(user1));
}

#[test]
fn claim_when_paused_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Owner pauses
    env.set_caller(owner);
    nft.pause();

    // Claim should fail
    env.set_caller(user1);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err());
}

#[test]
fn claim_insufficient_allowance_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    // Fund user1 with only 1 mote (not enough)
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, U256::from(1u64));

    env.set_caller(user1);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err());
}
```

- [ ] **Step 3: Run tests**

```bash
cd contracts/casper
cargo test test_claim -- --nocapture
```

Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add contracts/casper/tests/common.rs contracts/casper/tests/test_claim.rs
git commit -m "test(casper): add single claim unit tests"
```

---

### Task 6: Unit Tests — Batch Claim

**Files:**
- Create: `contracts/casper/tests/test_batch_claim.rs`

- [ ] **Step 1: Write batch claim tests**

Create `contracts/casper/tests/test_batch_claim.rs`:

```rust
//! Tests for batch tile claiming.

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn batch_claim_multiple_tiles() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64); // 1000 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids: Vec<U256> = vec![
        U256::from(10u64),
        U256::from(20u64),
        U256::from(30u64),
    ];

    env.set_caller(user1);
    nft.batch_claim(token_ids.clone());

    // Verify all minted
    for id in &token_ids {
        assert_eq!(nft.owner_of(*id), Some(user1));
    }
    assert_eq!(nft.balance_of(user1), U256::from(3u64));
    assert_eq!(nft.total_minted(), 3);
}

#[test]
fn batch_claim_incremental_pricing() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Get the expected total price for 5 tiles
    let expected_total = nft.price_for_batch(5);

    // Batch claim 5 tiles
    let token_ids: Vec<U256> = (0..5).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    nft.batch_claim(token_ids);

    // After minting 5, total_minted should be 5
    assert_eq!(nft.total_minted(), 5);
}

#[test]
fn batch_claim_exceeds_max_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(10_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // 101 tiles should fail
    let token_ids: Vec<U256> = (0..101).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    let result = nft.try_batch_claim(token_ids);
    assert!(result.is_err());
}

#[test]
fn batch_claim_empty_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    let result = nft.try_batch_claim(vec![]);
    assert!(result.is_err());
}

#[test]
fn batch_claim_with_duplicate_id_in_batch_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Duplicate ID in same batch — second mint should revert (TokenAlreadyExists)
    let token_ids = vec![U256::from(5u64), U256::from(5u64)];
    env.set_caller(user1);
    let result = nft.try_batch_claim(token_ids);
    assert!(result.is_err());
}

#[test]
fn batch_claim_100_tiles_succeeds() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(100_000_000_000_000u64); // 100k CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Exactly 100 tiles should succeed
    let token_ids: Vec<U256> = (0..100).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    nft.batch_claim(token_ids);

    assert_eq!(nft.total_minted(), 100);
    assert_eq!(nft.balance_of(user1), U256::from(100u64));
}
```

- [ ] **Step 2: Run tests**

```bash
cd contracts/casper
cargo test test_batch_claim -- --nocapture
```

Expected: All 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add contracts/casper/tests/test_batch_claim.rs
git commit -m "test(casper): add batch claim unit tests"
```

---

### Task 7: Unit Tests — Admin & Metadata

**Files:**
- Create: `contracts/casper/tests/test_admin.rs`
- Create: `contracts/casper/tests/test_metadata.rs`

- [ ] **Step 1: Write admin tests**

Create `contracts/casper/tests/test_admin.rs`:

```rust
//! Tests for admin functionality (pause, unpause, withdraw, ownership).

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn pause_and_unpause_by_owner() {
    let (env, mut nft, _, owner, _, _) = common::setup();

    env.set_caller(owner);
    nft.pause();
    assert!(nft.is_paused());

    nft.unpause();
    assert!(!nft.is_paused());
}

#[test]
fn pause_by_non_owner_reverts() {
    let (env, mut nft, _, _, user1, _) = common::setup();

    env.set_caller(user1);
    let result = nft.try_pause();
    assert!(result.is_err());
}

#[test]
fn unpause_by_non_owner_reverts() {
    let (env, mut nft, _, owner, user1, _) = common::setup();

    // Owner pauses first
    env.set_caller(owner);
    nft.pause();

    // Non-owner tries to unpause
    env.set_caller(user1);
    let result = nft.try_unpause();
    assert!(result.is_err());
}

#[test]
fn withdraw_full_balance() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    // Fund and claim to get wCSPR into the contract
    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    // Check contract has wCSPR
    let contract_balance = wcspr.balance_of(nft_address);
    assert!(contract_balance > U256::zero());

    // Owner withdraws all (amount = 0)
    let treasury_balance_before = wcspr.balance_of(owner);
    env.set_caller(owner);
    nft.withdraw(U256::zero());

    // Treasury received the funds
    let treasury_balance_after = wcspr.balance_of(owner);
    assert_eq!(treasury_balance_after - treasury_balance_before, contract_balance);

    // Contract balance is now 0
    assert_eq!(wcspr.balance_of(nft_address), U256::zero());
}

#[test]
fn withdraw_partial_amount() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    let contract_balance = wcspr.balance_of(nft_address);
    let half = contract_balance / 2;

    env.set_caller(owner);
    nft.withdraw(half);

    // Half remains in contract
    let remaining = wcspr.balance_of(nft_address);
    assert_eq!(remaining, contract_balance - half);
}

#[test]
fn withdraw_by_non_owner_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    // Non-owner tries to withdraw
    env.set_caller(user1);
    let result = nft.try_withdraw(U256::zero());
    assert!(result.is_err());
}

#[test]
fn transfer_ownership() {
    let (env, mut nft, _, owner, user1, _) = common::setup();

    assert_eq!(nft.get_owner(), owner);

    env.set_caller(owner);
    nft.transfer_ownership(&user1);

    assert_eq!(nft.get_owner(), user1);

    // New owner can pause
    env.set_caller(user1);
    nft.pause();
    assert!(nft.is_paused());
}
```

- [ ] **Step 2: Write metadata tests**

Create `contracts/casper/tests/test_metadata.rs`:

```rust
//! Tests for metadata (set_tile_uri, CEP-96 collection metadata).

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn cep96_collection_metadata() {
    let (_, nft, _, _, _, _) = common::setup();

    assert_eq!(nft.contract_name(), Some("TilesBot Grid".to_string()));
    assert_eq!(nft.contract_description(), Some("AI Agent Grid on Casper".to_string()));
    assert_eq!(nft.contract_icon_uri(), Some("https://tiles.bot/icon.png".to_string()));
    assert_eq!(nft.contract_project_uri(), Some("https://tiles.bot".to_string()));
}

#[test]
fn cep95_name_and_symbol() {
    let (_, nft, _, _, _, _) = common::setup();

    assert_eq!(nft.name(), "TilesBot");
    assert_eq!(nft.symbol(), "TILE");
}

#[test]
fn set_tile_uri_by_owner() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // Claim tile
    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    // Set URI
    nft.set_tile_uri(U256::from(42u64), "https://tiles.bot/api/tiles/42".to_string());

    // Verify metadata
    let metadata = nft.token_metadata(U256::from(42u64));
    let uri = metadata.iter().find(|(k, _)| k == "uri").map(|(_, v)| v.clone());
    assert_eq!(uri, Some("https://tiles.bot/api/tiles/42".to_string()));
}

#[test]
fn set_tile_uri_by_non_owner_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, user2) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // user1 claims tile
    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    // user2 tries to set URI — should fail
    env.set_caller(user2);
    let result = nft.try_set_tile_uri(U256::from(42u64), "malicious".to_string());
    assert!(result.is_err());
}

#[test]
fn nft_transfer_works() {
    let (env, mut nft, mut wcspr, owner, user1, user2) = common::setup();
    let nft_address = *nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    // user1 claims tile
    env.set_caller(user1);
    nft.claim(U256::from(7u64));
    assert_eq!(nft.owner_of(U256::from(7u64)), Some(user1));

    // user1 transfers to user2
    nft.transfer_from(user1, user2, U256::from(7u64));
    assert_eq!(nft.owner_of(U256::from(7u64)), Some(user2));
    assert_eq!(nft.balance_of(user1), U256::zero());
    assert_eq!(nft.balance_of(user2), U256::from(1u64));
}
```

- [ ] **Step 3: Run all tests**

```bash
cd contracts/casper
cargo test -- --nocapture
```

Expected: All tests pass (bonding_curve + claim + batch_claim + admin + metadata)

- [ ] **Step 4: Commit**

```bash
git add contracts/casper/tests/test_admin.rs contracts/casper/tests/test_metadata.rs
git commit -m "test(casper): add admin and metadata unit tests"
```

---

### Task 8: WASM Build Verification

**Files:**
- No new files; verifying the build pipeline

- [ ] **Step 1: Ensure build tools are installed**

```bash
which wasm-opt || cargo install wasm-opt
which wasm-strip || sudo apt-get install -y wabt
```

- [ ] **Step 2: Build the WASM artifact**

```bash
cd contracts/casper
cargo odra build
```

Expected: 
- `INFO : Saving .../wasm/TilesBotNft.wasm`
- `INFO : Optimizing wasm files...`
- No errors

- [ ] **Step 3: Verify WASM file exists and is reasonably sized**

```bash
ls -la contracts/casper/wasm/TilesBotNft.wasm
```

Expected: File exists, size is reasonable (typically 100KB-500KB for an Odra contract)

- [ ] **Step 4: Run full test suite one final time**

```bash
cd contracts/casper
cargo test
```

Expected: All tests pass, 0 failures

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -u
git commit -m "build(casper): verify WASM artifact builds successfully"
```

---

### Task 9: Documentation & Final Polish

**Files:**
- Create: `contracts/casper/README.md`

- [ ] **Step 1: Write contract README**

Create `contracts/casper/README.md`:

```markdown
# TilesBot NFT — Casper CEP-95/96 Contract

AI Agent Grid NFT contract for tiles.bot on Casper 2.0.

## Overview

- **Standard:** CEP-95 (NFT) + CEP-96 (collection metadata)
- **Framework:** Odra v2.7+
- **Grid:** 256×256 = 65,536 tiles (token IDs 0-65535)
- **Pricing:** Exponential bonding curve (0.01 → 111 CSPR)
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
| `pause()` / `unpause()` | Owner | Emergency stop |
| `withdraw(amount)` | Owner | Withdraw wCSPR to treasury |
| `transfer_ownership(new)` | Owner | Transfer admin |

Plus all standard CEP-95 (transfer, approve, etc.) and CEP-96 (collection metadata) entry points.

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
```

- [ ] **Step 2: Final commit**

```bash
git add contracts/casper/README.md
git commit -m "docs(casper): add contract README with build and deployment info"
```

- [ ] **Step 3: Verify full test suite passes**

```bash
cd contracts/casper
cargo test
cargo odra build
```

Expected: All tests pass, WASM builds successfully

---

## Summary of Deliverables

| Artifact | Path |
|---|---|
| Contract source | `contracts/casper/src/tiles_bot_nft.rs` |
| Bonding curve math | `contracts/casper/src/bonding_curve.rs` |
| Error definitions | `contracts/casper/src/errors.rs` |
| Event definitions | `contracts/casper/src/events.rs` |
| Test: bonding curve | `contracts/casper/tests/test_bonding_curve.rs` |
| Test: single claim | `contracts/casper/tests/test_claim.rs` |
| Test: batch claim | `contracts/casper/tests/test_batch_claim.rs` |
| Test: admin ops | `contracts/casper/tests/test_admin.rs` |
| Test: metadata | `contracts/casper/tests/test_metadata.rs` |
| WASM artifact | `contracts/casper/wasm/TilesBotNft.wasm` |
| Documentation | `contracts/casper/README.md` |

## Notes for Implementer

1. **Odra version:** Use 2.7.0+ (the version in the cargo git checkout on this machine). Check `Cargo.lock` after first build to confirm.

2. **CEP-18 interface:** The `#[odra::external_contract]` trait `Cep18Token` is used to interact with the wCSPR contract. If Odra's generated client doesn't match the actual wCSPR ABI, you may need to adjust the trait method signatures. The core methods needed are `transfer_from`, `transfer`, and `balance_of`.

3. **Fixed-point precision:** The Taylor series approximation (degree 6) should give <0.1% error across the full range. If tests show unacceptable drift at high mint counts, add a 7th-degree term or switch to a lookup table with interpolation.

4. **Test environment:** Odra's test env (`odra_test::env()`) provides mock accounts and CEP-18 token deployment. The `Cep18Token` from `odra-modules` serves as the mock wCSPR for testing.

5. **Build command:** Always use `cargo odra build`, never `cargo build --target wasm32-unknown-unknown` (the CLI binary has deps that can't target WASM).