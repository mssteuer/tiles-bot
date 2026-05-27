//! Mock wCSPR (CEP-18) token for testnet/devnet deployment.
//!
//! A thin wrapper around Odra's built-in Cep18 module with public entry points.
//! Used by the deploy script to deploy a test wCSPR alongside the NFT contract.

use odra::casper_types::U256;
use odra::prelude::*;
use odra_modules::access::Ownable;
use odra_modules::cep18_token::Cep18;

#[odra::module]
pub struct MockWcspr {
    token: SubModule<Cep18>,
    ownable: SubModule<Ownable>,
}

#[odra::module]
impl MockWcspr {
    pub fn init(&mut self, symbol: String, name: String, decimals: u8, initial_supply: U256) {
        let caller = self.env().caller();
        self.ownable.init(caller);
        self.token.init(symbol, name, decimals, initial_supply);
    }

    delegate! {
        to self.token {
            fn name(&self) -> String;
            fn symbol(&self) -> String;
            fn decimals(&self) -> u8;
            fn total_supply(&self) -> U256;
            fn balance_of(&self, address: &Address) -> U256;
            fn allowance(&self, owner: &Address, spender: &Address) -> U256;
            fn approve(&mut self, spender: &Address, amount: &U256);
            fn decrease_allowance(&mut self, spender: &Address, decr_by: &U256);
            fn increase_allowance(&mut self, spender: &Address, inc_by: &U256);
            fn transfer(&mut self, recipient: &Address, amount: &U256);
            fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256);
        }
    }
}
