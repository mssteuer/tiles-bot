//! TilesBot NFT -- CEP-95/96 NFT contract for tiles.bot on Casper.
//!
//! A 256x256 grid of NFT tiles priced via an exponential bonding curve.
//! Payment in wCSPR (CEP-18). Supports single and batch claims.

use odra::casper_types::bytesrepr::Bytes;
use odra::casper_types::U256;
use odra::prelude::*;
use odra::ContractRef;
use odra_modules::access::Ownable;
use odra_modules::cep95::{CEP95Interface, Cep95};
use odra_modules::cep96::{Cep96, Cep96ContractMetadata};
use odra_modules::security::Pauseable;

use crate::bonding_curve::{self, MAX_BATCH_SIZE, MAX_SUPPLY};
use crate::errors::TilesBotError;
use crate::events::{TileClaimed, TreasuryWithdrawal};

const KEY_CONTRACT_ICON_URI: &str = "contract_icon_uri";

// -- CEP-18 external contract interface for wCSPR interaction

#[odra::external_contract]
trait Cep18Token {
    fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
    fn transfer(&mut self, recipient: &Address, amount: &U256);
    fn balance_of(&self, address: &Address) -> U256;
}

// -- Main contract

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
        // Extract caller before mutable borrows
        let caller = self.env().caller();

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
        self.ownable.init(caller);

        // Store payment config
        self.wcspr_address.set(wcspr_address);
        self.treasury.set(treasury);
        self.total_minted.set(0);
    }

    // -- Claim entry points

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

    // -- Metadata

    /// Set the URI for a tile. Only the token owner can call this.
    pub fn set_tile_uri(&mut self, token_id: U256, uri: String) {
        let caller = self.env().caller();
        let owner = self.cep95.owner_of(token_id);
        if owner != Some(caller) {
            self.env().revert(TilesBotError::NotTokenOwner);
        }
        self.cep95
            .set_metadata(token_id, vec![("uri".to_string(), uri)]);
    }

    /// Set the CEP-96 collection icon URI. Owner only.
    pub fn set_contract_icon_uri(&mut self, uri: String) {
        let caller = self.env().caller();
        self.ownable.assert_owner(&caller);
        self.env().set_named_value(KEY_CONTRACT_ICON_URI, uri);
    }

    // -- View functions

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

    /// Check if the contract is paused.
    pub fn is_paused(&self) -> bool {
        self.pauseable.is_paused()
    }

    // -- Admin functions

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
        let caller = self.env().caller();
        self.ownable.assert_owner(&caller);

        let wcspr_address = self.wcspr_address.get().unwrap();
        let treasury = self.treasury.get().unwrap();
        let self_address = self.env().self_address();

        let mut wcspr = Cep18TokenContractRef::new(self.env(), wcspr_address);

        let withdraw_amount = if amount == U256::zero() {
            wcspr.balance_of(&self_address)
        } else {
            amount
        };

        wcspr.transfer(&treasury, &withdraw_amount);

        self.env().emit_event(TreasuryWithdrawal {
            to: treasury,
            amount: withdraw_amount,
        });
    }

    // -- Delegated CEP-95 entry points

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

    // -- Delegated CEP-96 entry points

    delegate! {
        to self.cep96 {
            fn contract_name(&self) -> Option<String>;
            fn contract_description(&self) -> Option<String>;
            fn contract_icon_uri(&self) -> Option<String>;
            fn contract_project_uri(&self) -> Option<String>;
        }
    }

    // -- Delegated Ownable entry points

    delegate! {
        to self.ownable {
            fn get_owner(&self) -> Address;
            fn transfer_ownership(&mut self, new_owner: &Address);
        }
    }
}

// -- Private implementation

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
        let self_address = self.env().self_address();
        let mut wcspr = Cep18TokenContractRef::new(self.env(), wcspr_address);
        wcspr.transfer_from(&from, &self_address, &amount);
    }
}
