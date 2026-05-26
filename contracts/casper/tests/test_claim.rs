//! Tests for single tile claiming.

mod common;

use odra::casper_types::U256;
use odra::host::HostRef;
use odra::prelude::*;

#[test]
fn claim_single_tile_succeeds() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000u64); // 100 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    assert_eq!(nft.owner_of(U256::from(42u64)), Some(user1));
    assert_eq!(nft.balance_of(user1), U256::from(1u64));
    assert_eq!(nft.total_minted(), 1);
}

#[test]
fn claim_increments_price() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let price_before = nft.current_price();
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    let price_after = nft.current_price();
    assert!(
        price_after > price_before,
        "Price should increase after mint"
    );
}

#[test]
fn claim_duplicate_token_id_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, user2) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user2, fund_amount);

    env.set_caller(user1);
    nft.claim(U256::from(100u64));

    env.set_caller(user2);
    let result = nft.try_claim(U256::from(100u64));
    assert!(result.is_err());
}

#[test]
fn claim_invalid_token_id_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);

    let result = nft.try_claim(U256::from(65536u64));
    assert!(result.is_err());

    nft.claim(U256::from(65535u64));
    assert_eq!(nft.owner_of(U256::from(65535u64)), Some(user1));
}

#[test]
fn claim_when_paused_reverts() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(owner);
    nft.pause();

    env.set_caller(user1);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err());
}

#[test]
fn claim_insufficient_allowance_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, U256::from(1u64));

    env.set_caller(user1);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err());
}
