//! Shared test setup for TilesBot NFT tests.

use odra::casper_types::U256;
use odra::host::{Deployer, HostEnv};
use odra::prelude::*;

use tiles_bot_nft::tiles_bot_nft::{TilesBotNftHostRef, TilesBotNftInitArgs};
use tiles_bot_nft::mock_wcspr::{MockWcsprHostRef, MockWcsprInitArgs};

// Re-export for tests that import common
pub use tiles_bot_nft::mock_wcspr::MockWcspr;

// -- Setup

pub const INITIAL_WCSPR_SUPPLY: u64 = 1_000_000_000_000_000; // 1M CSPR in motes

/// Deploy a mock wCSPR token and the TilesBot NFT contract.
pub fn setup() -> (
    HostEnv,
    TilesBotNftHostRef,
    MockWcsprHostRef,
    Address,
    Address,
    Address,
) {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let user1 = env.get_account(1);
    let user2 = env.get_account(2);

    // Deploy mock wCSPR (CEP-18 token)
    let wcspr = MockWcspr::deploy(
        &env,
        MockWcsprInitArgs {
            symbol: "wCSPR".to_string(),
            name: "Wrapped CSPR".to_string(),
            decimals: 9,
            initial_supply: U256::from(INITIAL_WCSPR_SUPPLY),
        },
    );

    // Deploy the NFT contract
    let nft = tiles_bot_nft::tiles_bot_nft::TilesBotNft::deploy(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address: wcspr.address(),
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
    wcspr: &mut MockWcsprHostRef,
    nft_address: Address,
    user: Address,
    amount: U256,
) {
    // Transfer wCSPR from owner (account 0) to user
    let owner = env.get_account(0);
    env.set_caller(owner);
    wcspr.transfer(&user, &amount);

    // Approve NFT contract to spend user's wCSPR
    env.set_caller(user);
    wcspr.approve(&nft_address, &amount);
}
