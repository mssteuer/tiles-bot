//! Livenet deployment test for TilesBot NFT.
//!
//! Uses ODRA_CASPER_LIVENET_SECRET_KEY_PATH to detect real deployment.
//! When the env var is set, connects to the actual Casper network (testnet/devnet).
//! When unset, falls back to the Odra mock VM for CI/development verification.
//!
//! For real deployment:
//!   ./scripts/deploy.sh testnet
//!
//! For mock verification:
//!   cargo test --test deploy_livenet -- --nocapture

use odra::casper_types::U256;
use odra::host::{Deployer, HostEnv, InstallConfig};
use odra::prelude::*;

use tiles_bot_nft::mock_wcspr::{MockWcspr, MockWcsprInitArgs};
use tiles_bot_nft::tiles_bot_nft::{TilesBotNft, TilesBotNftInitArgs};

/// Get the appropriate HostEnv -- livenet if configured, mock otherwise.
fn get_env() -> HostEnv {
    if std::env::var("ODRA_CASPER_LIVENET_SECRET_KEY_PATH").is_ok() {
        eprintln!("== LIVENET MODE: deploying to real Casper network ==");
        odra_casper_livenet_env::env()
    } else {
        eprintln!("== MOCK MODE: using Odra VM (no real deployment) ==");
        odra_test::env()
    }
}

const MAINNET_WCSPR_PACKAGE_HASH: &str =
    "hash-8df5d26790e18cf0404502c62ce5dc9025800ad6975c97466e20506c39c505b6";

fn wcspr_address_from_env() -> Address {
    // Address::new() is const-only in Odra 2.7.0, so keep the canonical
    // package hash explicit here. This test is for mainnet deployment only;
    // mock/test tokens stay in the other deploy tests.
    let package_hash = std::env::var("TILES_BOT_WCSPR_PACKAGE_HASH")
        .unwrap_or_else(|_| MAINNET_WCSPR_PACKAGE_HASH.to_string());
    assert_eq!(
        package_hash, MAINNET_WCSPR_PACKAGE_HASH,
        "Unexpected wCSPR package hash; update this deploy test intentionally before using a different token"
    );
    Address::new(MAINNET_WCSPR_PACKAGE_HASH).unwrap()
}

#[test]
fn deploy_nft_with_existing_wcspr() {
    let env = get_env();
    let deployer = env.get_account(0);
    let wcspr_address = wcspr_address_from_env();

    println!("== TilesBot NFT Mainnet Deployment ==");
    println!("Deployer / owner / treasury: {:?}", deployer);
    println!("wCSPR package: {:?}", wcspr_address);

    env.set_gas(800_000_000_000u64); // 800 CSPR for NFT deploy
    let nft = TilesBotNft::deploy_with_cfg(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address,
            treasury: deployer,
            contract_name: Some("TilesBot Grid".to_string()),
            contract_description: Some("AI Agent Grid on Casper".to_string()),
            contract_icon_uri: Some("https://tiles.bot/icon-512.png".to_string()),
            contract_project_uri: Some("https://tiles.bot".to_string()),
        },
        InstallConfig::upgradable::<TilesBotNft>(),
    );
    let nft_address = nft.address();

    assert_eq!(nft.name(), "TilesBot");
    assert_eq!(nft.symbol(), "TILE");
    assert_eq!(nft.total_minted(), 0);
    assert_eq!(nft.get_owner(), deployer);
    assert!(!nft.is_paused());
    assert_eq!(nft.contract_name(), Some("TilesBot Grid".to_string()));

    println!("\n== Mainnet NFT Deployment SUCCESSFUL ==");
    println!("TilesBot NFT: {:?}", nft_address);
    println!("wCSPR:        {:?}", wcspr_address);
    println!("Treasury:     {:?}", deployer);
}

#[test]
fn deploy_and_verify() {
    let env = get_env();
    let deployer = env.get_account(0);

    println!("== TilesBot NFT Deployment ==");
    println!("Deployer: {:?}", deployer);

    // -- Step 1: Deploy wCSPR
    println!("\n== Step 1: Deploying test wCSPR token ==");
    env.set_gas(500_000_000_000u64); // 500 CSPR for wCSPR deploy
    let wcspr = MockWcspr::deploy(
        &env,
        MockWcsprInitArgs {
            symbol: "wCSPR".to_string(),
            name: "Wrapped CSPR".to_string(),
            decimals: 9,
            initial_supply: U256::from(1_000_000_000_000_000u64),
        },
    );
    let wcspr_address = wcspr.address();
    println!("wCSPR deployed at: {:?}", wcspr_address);

    // -- Step 2: Deploy TilesBot NFT
    println!("\n== Step 2: Deploying TilesBot NFT ==");
    env.set_gas(800_000_000_000u64); // 800 CSPR for NFT deploy
    let nft = TilesBotNft::deploy(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address,
            treasury: deployer,
            contract_name: Some("TilesBot Grid".to_string()),
            contract_description: Some("AI Agent Grid on Casper".to_string()),
            contract_icon_uri: Some("https://tiles.bot/icon-512.png".to_string()),
            contract_project_uri: Some("https://tiles.bot".to_string()),
        },
    );
    let nft_address = nft.address();
    println!("TilesBot NFT deployed at: {:?}", nft_address);

    // -- Step 3: Verify contract state
    assert_eq!(nft.name(), "TilesBot");
    assert_eq!(nft.symbol(), "TILE");
    assert_eq!(nft.total_minted(), 0);
    assert_eq!(nft.get_owner(), deployer);
    assert!(!nft.is_paused());

    // -- Step 4: CEP-96 metadata
    assert_eq!(nft.contract_name(), Some("TilesBot Grid".to_string()));

    println!("\n== Deployment SUCCESSFUL ==");
    println!("wCSPR:        {:?}", wcspr_address);
    println!("TilesBot NFT: {:?}", nft_address);
}

#[test]
fn deploy_and_test_mint() {
    let env = get_env();
    let deployer = env.get_account(0);

    // Deploy mock wCSPR
    env.set_gas(500_000_000_000u64); // 500 CSPR for wCSPR deploy
    let mut wcspr = MockWcspr::deploy(
        &env,
        MockWcsprInitArgs {
            symbol: "wCSPR".to_string(),
            name: "Wrapped CSPR".to_string(),
            decimals: 9,
            initial_supply: U256::from(1_000_000_000_000_000u64),
        },
    );
    let wcspr_address = wcspr.address();

    // Deploy NFT contract
    env.set_gas(800_000_000_000u64); // 800 CSPR for NFT deploy
    let mut nft = TilesBotNft::deploy(
        &env,
        TilesBotNftInitArgs {
            name: "TilesBot".to_string(),
            symbol: "TILE".to_string(),
            wcspr_address,
            treasury: deployer,
            contract_name: Some("TilesBot Grid".to_string()),
            contract_description: Some("AI Agent Grid on Casper".to_string()),
            contract_icon_uri: Some("https://tiles.bot/icon-512.png".to_string()),
            contract_project_uri: Some("https://tiles.bot".to_string()),
        },
    );
    let nft_address = nft.address();

    // Approve and claim tile #42
    env.set_gas(50_000_000_000u64); // 50 CSPR for approve
    let fund_amount = U256::from(100_000_000_000u64);
    wcspr.approve(&nft_address, &fund_amount);
    env.set_gas(50_000_000_000u64); // 50 CSPR for claim
    nft.claim(U256::from(42u64));
    assert_eq!(nft.owner_of(U256::from(42u64)), Some(deployer));
    assert_eq!(nft.total_minted(), 1);

    // Batch claim 3 more tiles
    env.set_gas(50_000_000_000u64); // 50 CSPR for approve
    let batch_amount = U256::from(500_000_000_000u64);
    wcspr.approve(&nft_address, &batch_amount);
    env.set_gas(100_000_000_000u64); // 100 CSPR for batch claim
    nft.batch_claim(vec![
        U256::from(100u64),
        U256::from(200u64),
        U256::from(300u64),
    ]);
    assert_eq!(nft.total_minted(), 4);
    assert_eq!(nft.balance_of(deployer), U256::from(4u64));

    println!("== Mint Test PASSED ==");
}
