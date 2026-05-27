//! End-to-end test: Casper x402 payment + NFT mint flow.
//!
//! Simulates the complete agent experience:
//!   1. Deploy contracts (wCSPR + TilesBotNft)
//!   2. Query current price (what x402 402 response provides)
//!   3. Fund agent wallet with wCSPR
//!   4. Agent approves wCSPR spending to NFT contract
//!   5. Agent claims a tile (single)
//!   6. Verify on-chain ownership
//!   7. Agent claims a batch of tiles
//!   8. Verify batch ownership + incremental pricing
//!   9. Error cases: double-claim, insufficient funds, paused, invalid ID
//!
//! Success criteria: full flow completes, ownership verifiable, error cases tested.
//!
//! Run: cargo test --test test_e2e_x402_flow -- --nocapture

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

use tiles_bot_nft::bonding_curve;

// -- Step 1-7: Full single-claim agent flow

#[test]
fn e2e_agent_single_claim_flow() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    // Step 2: Query current price (simulates 402 response payload)
    let price = nft.current_price();
    assert!(price > U256::zero(), "Price must be > 0");
    assert_eq!(nft.total_minted(), 0, "No tiles minted yet");

    // Verify price matches bonding curve at position 0
    let expected_price = bonding_curve::compute_price(0);
    assert_eq!(
        price,
        U256::from(expected_price),
        "Price should match bonding curve"
    );

    // Step 3: Fund agent with wCSPR (simulates agent wrapping CSPR)
    let fund_amount = U256::from(500_000_000_000u64); // 500 CSPR worth of wCSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund_amount);

    // Verify agent has wCSPR
    let agent_balance = wcspr.balance_of(&agent);
    assert_eq!(agent_balance, fund_amount, "Agent should have wCSPR");

    // Step 4: Approve already done in fund_and_approve
    let allowance = wcspr.allowance(&agent, &nft_address);
    assert_eq!(allowance, fund_amount, "NFT contract should be approved");

    // Step 5: Agent claims tile #42
    let tile_id = U256::from(42u64);
    env.set_caller(agent);
    nft.claim(tile_id);

    // Step 6: Verify on-chain ownership
    let owner = nft.owner_of(tile_id);
    assert_eq!(owner, Some(agent), "Agent should own tile #42");
    assert_eq!(
        nft.balance_of(agent),
        U256::from(1u64),
        "Agent should have 1 NFT"
    );
    assert_eq!(nft.total_minted(), 1, "1 tile should be minted");

    // Verify price increased after mint
    let new_price = nft.current_price();
    assert!(new_price > price, "Price must increase after mint");

    // Verify wCSPR was deducted
    let remaining = wcspr.balance_of(&agent);
    assert!(remaining < fund_amount, "Agent's wCSPR should decrease");
    assert_eq!(
        fund_amount - remaining,
        price,
        "Deducted amount should equal price"
    );
}

// -- Step 7-8: Batch claim flow

#[test]
fn e2e_agent_batch_claim_flow() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    // Fund agent generously for batch
    let fund_amount = U256::from(5_000_000_000_000u64); // 5000 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund_amount);

    // Query batch price before claiming
    let batch_count = 5u64;
    let batch_price = nft.price_for_batch(batch_count);
    assert!(batch_price > U256::zero(), "Batch price must be > 0");

    // Verify batch price = sum of individual prices
    let mut sum = U256::zero();
    for i in 0..batch_count {
        sum += U256::from(bonding_curve::compute_price(i));
    }
    assert_eq!(
        batch_price, sum,
        "Batch price should equal sum of individual prices"
    );

    // Agent batch-claims 5 tiles
    let tile_ids = vec![
        U256::from(100u64),
        U256::from(200u64),
        U256::from(300u64),
        U256::from(400u64),
        U256::from(500u64),
    ];

    let balance_before = wcspr.balance_of(&agent);
    env.set_caller(agent);
    nft.batch_claim(tile_ids.clone());

    // Verify all ownership
    for &tid in &tile_ids {
        assert_eq!(nft.owner_of(tid), Some(agent), "Agent should own tile {tid:?}");
    }
    assert_eq!(
        nft.balance_of(agent),
        U256::from(5u64),
        "Agent should have 5 NFTs"
    );
    assert_eq!(nft.total_minted(), 5, "5 tiles should be minted");

    // Verify payment was correct (incremental pricing)
    let balance_after = wcspr.balance_of(&agent);
    let total_paid = balance_before - balance_after;
    assert_eq!(
        total_paid, batch_price,
        "Total paid should match batch price"
    );
}

// -- Step 9: Error cases

#[test]
fn e2e_error_double_claim() {
    let (env, mut nft, mut wcspr, _owner, agent1, agent2) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent1, fund);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent2, fund);

    // Agent1 claims tile #7
    env.set_caller(agent1);
    nft.claim(U256::from(7u64));

    // Agent2 tries to claim same tile
    env.set_caller(agent2);
    let result = nft.try_claim(U256::from(7u64));
    assert!(result.is_err(), "Double-claim should revert");

    // Original owner unchanged
    assert_eq!(nft.owner_of(U256::from(7u64)), Some(agent1));
}

#[test]
fn e2e_error_insufficient_wcspr() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    // Fund with tiny amount (less than price)
    let tiny = U256::from(1u64); // 1 mote, way less than price
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, tiny);

    env.set_caller(agent);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err(), "Insufficient wCSPR should revert");
}

#[test]
fn e2e_error_no_approval() {
    let (env, mut nft, mut wcspr, owner, agent, _) = common::setup();

    // Transfer wCSPR but don't approve
    let fund = U256::from(100_000_000_000u64);
    env.set_caller(owner);
    wcspr.transfer(&agent, &fund);

    // Try to claim without approval
    env.set_caller(agent);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err(), "Claim without approval should revert");
}

#[test]
fn e2e_error_invalid_token_id() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    env.set_caller(agent);

    // Token ID >= 65536 should revert
    let result = nft.try_claim(U256::from(65536u64));
    assert!(result.is_err(), "Token ID 65536 should revert");

    let result = nft.try_claim(U256::from(100_000u64));
    assert!(result.is_err(), "Token ID 100000 should revert");
}

#[test]
fn e2e_error_claim_while_paused() {
    let (env, mut nft, mut wcspr, owner, agent, _) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    // Owner pauses
    env.set_caller(owner);
    nft.pause();
    assert!(nft.is_paused(), "Contract should be paused");

    // Agent tries to claim
    env.set_caller(agent);
    let result = nft.try_claim(U256::from(0u64));
    assert!(result.is_err(), "Claim while paused should revert");

    // Owner unpauses
    env.set_caller(owner);
    nft.unpause();
    assert!(!nft.is_paused(), "Contract should be unpaused");

    // Agent can now claim
    env.set_caller(agent);
    nft.claim(U256::from(0u64));
    assert_eq!(nft.owner_of(U256::from(0u64)), Some(agent));
}

#[test]
fn e2e_error_batch_too_large() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000_000u64); // lots of wCSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    // Build batch of 101 (exceeds MAX_BATCH_SIZE=100)
    let too_many: Vec<U256> = (0..101).map(|i| U256::from(i as u64)).collect();

    env.set_caller(agent);
    let result = nft.try_batch_claim(too_many);
    assert!(result.is_err(), "Batch > 100 should revert");
}

#[test]
fn e2e_error_empty_batch() {
    let (env, mut nft, mut wcspr, _owner, agent, _) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    env.set_caller(agent);
    let result = nft.try_batch_claim(vec![]);
    assert!(result.is_err(), "Empty batch should revert");
}

// -- Full lifecycle: claim -> transfer -> set URI

#[test]
fn e2e_full_lifecycle_claim_transfer_metadata() {
    let (env, mut nft, mut wcspr, _owner, agent, new_owner) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(100_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    let tile_id = U256::from(1337u64);

    // Agent claims
    env.set_caller(agent);
    nft.claim(tile_id);
    assert_eq!(nft.owner_of(tile_id), Some(agent));

    // Agent sets URI
    nft.set_tile_uri(tile_id, "https://tiles.bot/tile/1337".to_string());
    let metadata = nft.token_metadata(tile_id);
    let uri = metadata
        .iter()
        .find(|(k, _)| k == "uri")
        .map(|(_, v)| v.clone());
    assert_eq!(uri, Some("https://tiles.bot/tile/1337".to_string()));

    // Agent transfers to new_owner
    nft.transfer_from(agent, new_owner, tile_id);
    assert_eq!(nft.owner_of(tile_id), Some(new_owner));
    assert_eq!(nft.balance_of(agent), U256::from(0u64));
    assert_eq!(nft.balance_of(new_owner), U256::from(1u64));

    // Old owner can't set URI anymore
    env.set_caller(agent);
    let result = nft.try_set_tile_uri(tile_id, "hacked".to_string());
    assert!(result.is_err(), "Former owner should not set URI");

    // New owner can set URI
    env.set_caller(new_owner);
    nft.set_tile_uri(tile_id, "https://new-owner.bot/tile/1337".to_string());
    let metadata = nft.token_metadata(tile_id);
    let uri = metadata
        .iter()
        .find(|(k, _)| k == "uri")
        .map(|(_, v)| v.clone());
    assert_eq!(uri, Some("https://new-owner.bot/tile/1337".to_string()));
}

// -- Treasury withdrawal flow

#[test]
fn e2e_treasury_withdrawal_after_claims() {
    let (env, mut nft, mut wcspr, owner, agent, _) = common::setup();
    let nft_address = nft.address();

    let fund = U256::from(5_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, agent, fund);

    // Agent claims several tiles
    env.set_caller(agent);
    nft.batch_claim(vec![
        U256::from(10u64),
        U256::from(20u64),
        U256::from(30u64),
    ]);

    // Contract should hold wCSPR
    let contract_balance = wcspr.balance_of(&nft_address);
    assert!(
        contract_balance > U256::zero(),
        "Contract should hold payment"
    );

    // Owner withdraws to treasury (owner IS treasury in setup)
    let owner_before = wcspr.balance_of(&owner);
    env.set_caller(owner);
    nft.withdraw(U256::zero()); // 0 = withdraw all
    let owner_after = wcspr.balance_of(&owner);

    assert!(owner_after > owner_before, "Treasury should receive wCSPR");
    assert_eq!(
        wcspr.balance_of(&nft_address),
        U256::zero(),
        "Contract balance should be 0 after full withdrawal"
    );

    // Non-owner can't withdraw
    env.set_caller(agent);
    let result = nft.try_withdraw(U256::zero());
    assert!(result.is_err(), "Non-owner withdrawal should revert");
}
