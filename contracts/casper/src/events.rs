use odra::casper_types::U256;
use odra::prelude::*;

/// Emitted when a tile is claimed (purchased and minted).
#[odra::event]
pub struct TileClaimed {
    /// The address of the new tile owner.
    pub owner: Address,
    /// The tile token ID (0-65535).
    pub token_id: U256,
    /// The price paid in wCSPR motes.
    pub price: U256,
}

/// Emitted when the admin withdraws wCSPR from the contract.
#[odra::event]
pub struct TreasuryWithdrawal {
    /// The treasury address receiving the funds.
    pub to: Address,
    /// The amount withdrawn in wCSPR motes.
    pub amount: U256,
}
