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

    env.set_caller(owner);
    nft.pause();

    env.set_caller(user1);
    let result = nft.try_unpause();
    assert!(result.is_err());
}

#[test]
fn withdraw_full_balance() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    // Check contract has wCSPR
    let contract_balance = wcspr.balance_of(&nft_address);
    assert!(contract_balance > U256::zero());

    // Owner withdraws all (amount = 0)
    let treasury_balance_before = wcspr.balance_of(&owner);
    env.set_caller(owner);
    nft.withdraw(U256::zero());

    let treasury_balance_after = wcspr.balance_of(&owner);
    assert_eq!(
        treasury_balance_after - treasury_balance_before,
        contract_balance
    );
    assert_eq!(wcspr.balance_of(&nft_address), U256::zero());
}

#[test]
fn withdraw_partial_amount() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

    let contract_balance = wcspr.balance_of(&nft_address);
    let half = contract_balance / 2;

    env.set_caller(owner);
    nft.withdraw(half);

    let remaining = wcspr.balance_of(&nft_address);
    assert_eq!(remaining, contract_balance - half);
}

#[test]
fn withdraw_by_non_owner_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    env.set_caller(user1);
    nft.claim(U256::from(0u64));

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
