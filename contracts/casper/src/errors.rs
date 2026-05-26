use odra::prelude::*;

/// Custom errors for the TilesBot NFT contract.
#[odra::odra_error]
pub enum TilesBotError {
    /// Token ID must be < 65536
    InvalidTokenId = 50_000,
    /// Batch size exceeds maximum of 100
    BatchTooLarge = 50_001,
    /// wCSPR transfer_from failed (insufficient allowance or balance)
    InsufficientPayment = 50_002,
    /// Caller is not the token owner (for set_tile_uri)
    NotTokenOwner = 50_003,
    /// All 65536 tiles have been minted
    MaxSupplyReached = 50_004,
    /// Batch claim array is empty
    BatchEmpty = 50_005,
}
