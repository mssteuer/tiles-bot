//! Tests for batch tile claiming.

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn batch_claim_multiple_tiles() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids: Vec<U256> = vec![
        U256::from(10u64),
        U256::from(20u64),
        U256::from(30u64),
    ];

    env.set_caller(user1);
    nft.batch_claim(token_ids.clone());

    for id in &token_ids {
        assert_eq!(nft.owner_of(*id), Some(user1));
    }
    assert_eq!(nft.balance_of(user1), U256::from(3u64));
    assert_eq!(nft.total_minted(), 3);
}

#[test]
fn batch_claim_incremental_pricing() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids: Vec<U256> = (0..5).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    nft.batch_claim(token_ids);

    assert_eq!(nft.total_minted(), 5);
}

#[test]
fn batch_claim_exceeds_max_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(10_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids: Vec<U256> = (0..101).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    let result = nft.try_batch_claim(token_ids);
    assert!(result.is_err());
}

#[test]
fn batch_claim_empty_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    let result = nft.try_batch_claim(vec![]);
    assert!(result.is_err());
}

#[test]
fn batch_claim_with_duplicate_id_in_batch_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids = vec![U256::from(5u64), U256::from(5u64)];
    env.set_caller(user1);
    let result = nft.try_batch_claim(token_ids);
    assert!(result.is_err());
}

#[test]
fn batch_claim_100_tiles_succeeds() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(100_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    let token_ids: Vec<U256> = (0..100).map(|i| U256::from(i as u64)).collect();
    env.set_caller(user1);
    nft.batch_claim(token_ids);

    assert_eq!(nft.total_minted(), 100);
    assert_eq!(nft.balance_of(user1), U256::from(100u64));
}
