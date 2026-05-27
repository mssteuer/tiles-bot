//! Livenet deployment test for TilesBot NFT.
//!
//! Run with: cargo odra test --backend casper -t deploy_livenet
//!
//! This deploys both a test wCSPR token AND the TilesBot NFT contract to the
//! configured live network (testnet or devnet). It then runs basic verification.
//!
//! Required env vars (set via .env or export):
//!   ODRA_CASPER_LIVENET_SECRET_KEY_PATH  - deployer key path
//!   ODRA_CASPER_LIVENET_NODE_ADDRESS     - RPC endpoint
//!   ODRA_CASPER_LIVENET_EVENTS_URL       - SSE events endpoint
//!   ODRA_CASPER_LIVENET_CHAIN_NAME       - chain name (casper-test or casper)
//!
//! Optional:
//!   WCSPR_CONTRACT_HASH - if set, uses an existing wCSPR instead of deploying one
//!   TREASURY_PUBKEY     - treasury address (defaults to deployer)

mod common;

use odra::casper_types::U256;
use odra::host::{Deployer, HostRef};
use odra::prelude::*;

use common::MockWcspr;
use tiles_bot_nft::tiles_bot_nft::{TilesBotNft, TilesBotNftInitArgs};

// -- Deploy and verify

#[test]
fn deploy_and_verify() {
    // Get the livenet environment from Odra
    let env = odra_test::env();
    let deployer = env.get_account(0);

    println!("== TilesBot NFT Livenet Deployment ==");
    println!("Deployer: {:?}", deployer);

    // -- Step 1: Deploy wCSPR (or use existing)
    println!("\n== Step 1: Deploying test wCSPR token ==");
    let wcspr = MockWcspr::deploy(
        &env,
        common::MockWcsprInitArgs {
            symbol: "wCSPR".to_string(),
            name: "Wrapped CSPR".to_string(),
            decimals: 9,
            initial_supply: U256::from(1_000_000_000_000_000u64), // 1M CSPR
        },
    );
    let wcspr_address = wcspr.address();
    println!("wCSPR deployed at: {:?}", wcspr_address);

    // -- Step 2: Deploy TilesBot NFT
    println!("\n== Step 2: Deploying TilesBot NFT ==");
    let nft = TilesBotNft::deploy(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address,
            treasury: deployer,
            contract_name: Some("TilesBot Grid".to_string()),
            contract_description: Some("AI Agent Grid on Casper".to_string()),
            contract_icon_uri: Some("https://tiles.bot/icon.png".to_string()),
            contract_project_uri: Some("https://tiles.bot".to_string()),
        },
    );
    let nft_address = nft.address();
    println!("TilesBot NFT deployed at: {:?}", nft_address);

    // -- Step 3: Verify contract state
    println!("\n== Step 3: Verifying contract state ==");
    assert_eq!(nft.name(), "TilesBot");
    assert_eq!(nft.symbol(), "TILE");
    assert_eq!(nft.total_minted(), 0);
    assert_eq!(nft.get_owner(), deployer);
    assert!(!nft.is_paused());
    println!("  name: {}", nft.name());
    println!("  symbol: {}", nft.symbol());
    println!("  total_minted: {}", nft.total_minted());
    println!("  owner: {:?}", nft.get_owner());
    println!("  paused: {}", nft.is_paused());
    println!("  current_price: {} motes", nft.current_price());

    // -- Step 4: CEP-96 metadata
    println!("\n== Step 4: CEP-96 collection metadata ==");
    assert_eq!(
        nft.contract_name(),
        Some("TilesBot Grid".to_string())
    );
    println!("  contract_name: {:?}", nft.contract_name());
    println!("  contract_description: {:?}", nft.contract_description());
    println!("  contract_icon_uri: {:?}", nft.contract_icon_uri());
    println!("  contract_project_uri: {:?}", nft.contract_project_uri());

    println!("\n== Deployment SUCCESSFUL ==");
    println!("wCSPR:       {:?}", wcspr_address);
    println!("TilesBot NFT: {:?}", nft_address);
    println!("\nSave these addresses for configuration!");
}

#[test]
fn deploy_and_test_mint() {
    let (env, mut nft, mut wcspr, owner, user1, _) = common::setup();
    let nft_address = nft.address();

    println!("== Test Mint Flow ==");

    // Fund user1 with wCSPR
    let fund_amount = U256::from(100_000_000_000u64); // 100 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);
    println!("Funded user1 with {} wCSPR motes", fund_amount);

    // Check price before claim
    let price = nft.current_price();
    println!("Current price: {} motes ({} CSPR)", price, price / U256::from(1_000_000_000u64));

    // Claim tile #42
    env.set_caller(user1);
    nft.claim(U256::from(42u64));
    println!("Claimed tile #42");

    // Verify
    assert_eq!(nft.owner_of(U256::from(42u64)), Some(user1));
    assert_eq!(nft.total_minted(), 1);
    println!("Owner of tile #42: {:?}", nft.owner_of(U256::from(42u64)));
    println!("Total minted: {}", nft.total_minted());
    println!("New price: {} motes", nft.current_price());

    // Batch claim 3 more tiles
    let fund_amount2 = U256::from(500_000_000_000u64); // 500 CSPR
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount2);
    env.set_caller(user1);
    nft.batch_claim(vec![
        U256::from(100u64),
        U256::from(200u64),
        U256::from(300u64),
    ]);
    println!("Batch claimed tiles #100, #200, #300");
    assert_eq!(nft.total_minted(), 4);
    assert_eq!(nft.balance_of(user1), U256::from(4u64));
    println!("User1 balance: {} tiles", nft.balance_of(user1));

    println!("\n== Mint Test PASSED ==");
}
