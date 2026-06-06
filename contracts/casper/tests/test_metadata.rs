//! Tests for metadata (set_tile_uri, CEP-96 collection metadata, transfers).

mod common;

use odra::casper_types::U256;
use odra::prelude::*;

#[test]
fn cep96_collection_metadata() {
    let (_, nft, _, _, _, _) = common::setup();

    assert_eq!(nft.contract_name(), Some("TilesBot Grid".to_string()));
    assert_eq!(
        nft.contract_description(),
        Some("AI Agent Grid on Casper".to_string())
    );
    assert_eq!(
        nft.contract_icon_uri(),
        Some("https://tiles.bot/icon-512.png".to_string())
    );
    assert_eq!(
        nft.contract_project_uri(),
        Some("https://tiles.bot".to_string())
    );
}

#[test]
fn cep95_name_and_symbol() {
    let (_, nft, _, _, _, _) = common::setup();

    assert_eq!(nft.name(), "TilesBot");
    assert_eq!(nft.symbol(), "TILE");
}

#[test]
fn contract_icon_uri_is_owner_updatable() {
    let (_env, mut nft, _, owner, _, _) = common::setup();
    let uri = "https://tiles.bot/icon-512-v2.png".to_string();

    nft.set_contract_icon_uri(uri.clone());

    assert_eq!(nft.contract_icon_uri(), Some(uri));
    assert_eq!(nft.get_owner(), owner);
}

#[test]
fn contract_icon_uri_by_non_owner_reverts() {
    let (env, mut nft, _, _, user1, _) = common::setup();

    env.set_caller(user1);
    let result = nft.try_set_contract_icon_uri("https://tiles.bot/nope.png".to_string());

    assert!(result.is_err());
}

#[test]
fn set_tile_uri_by_owner() {
    let (env, mut nft, mut wcspr, _owner, user1, _) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    nft.set_tile_uri(
        U256::from(42u64),
        "https://tiles.bot/api/tiles/42".to_string(),
    );

    let metadata = nft.token_metadata(U256::from(42u64));
    let uri = metadata
        .iter()
        .find(|(k, _)| k == "uri")
        .map(|(_, v)| v.clone());
    assert_eq!(uri, Some("https://tiles.bot/api/tiles/42".to_string()));
}

#[test]
fn set_tile_uri_by_non_owner_reverts() {
    let (env, mut nft, mut wcspr, _owner, user1, user2) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    nft.claim(U256::from(42u64));

    env.set_caller(user2);
    let result = nft.try_set_tile_uri(U256::from(42u64), "malicious".to_string());
    assert!(result.is_err());
}

#[test]
fn nft_transfer_works() {
    let (env, mut nft, mut wcspr, _owner, user1, user2) = common::setup();
    let nft_address = nft.address();

    let fund_amount = U256::from(1_000_000_000_000u64);
    common::fund_and_approve(&env, &mut wcspr, nft_address, user1, fund_amount);

    env.set_caller(user1);
    nft.claim(U256::from(7u64));
    assert_eq!(nft.owner_of(U256::from(7u64)), Some(user1));

    nft.transfer_from(user1, user2, U256::from(7u64));
    assert_eq!(nft.owner_of(U256::from(7u64)), Some(user2));
    assert_eq!(nft.balance_of(user1), U256::zero());
    assert_eq!(nft.balance_of(user2), U256::from(1u64));
}
