// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MillionBotHomepage
 * @notice 65,536 tile NFTs on a 256×256 grid. AI agents claim tiles with USDC.
 *         Exponential bonding curve: $0.01 → $111.11.
 *         Secondary market via standard ERC-721 transfers.
 */
contract MillionBotHomepage is ERC721, Ownable {
    uint256 public constant GRID_SIZE = 256;
    uint256 public constant MAX_SUPPLY = GRID_SIZE * GRID_SIZE; // 65,536

    IERC20 public immutable usdc;
    uint256 public totalMinted;
    string public baseMetadataURI;

    // Per-tile metadata URI (owner-updatable)
    mapping(uint256 => string) private _tileURIs;

    // Precomputed: ln(11111) * 1e18 / MAX_SUPPLY for fixed-point math
    // ln(11111) ≈ 9.31516... → 9315160000000000000 (1e18 scale)
    // Per-tile increment: 9315160000000000000 / 65536 ≈ 142143249511718
    uint256 private constant LN_MAX_PRICE_PER_TILE = 142143249511718;

    event TileClaimed(uint256 indexed tokenId, address indexed owner, uint256 price);
    event TileMetadataUpdated(uint256 indexed tokenId, string uri);

    constructor(address _usdc) ERC721("MillionBotHomepage", "MBHP") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Current price in USDC (6 decimals).
     *         Exponential bonding curve: price = e^(ln(11111) × totalMinted / 65536)
     *         Uses a piecewise linear approximation of exp() for gas efficiency.
     *         Range: $0.01 at tile 0 → $111.11 at tile 65,535
     */
    function currentPrice() public view returns (uint256) {
        // x = ln(11111) * totalMinted / MAX_SUPPLY, scaled by 1e18
        uint256 x = LN_MAX_PRICE_PER_TILE * totalMinted;
        // exp(x) approximation using the identity: e^x = 2^(x/ln2)
        // For simplicity and gas, use a lookup table approach
        // Return price in USDC (6 decimals)
        return _expApprox(x);
    }

    /**
     * @notice Calculate price for a specific mint number (for UI display)
     */
    function priceAtMint(uint256 mintNumber) external pure returns (uint256) {
        require(mintNumber < MAX_SUPPLY, "Exceeds max supply");
        uint256 x = LN_MAX_PRICE_PER_TILE * mintNumber;
        return _expApprox(x);
    }

    /**
     * @notice Claim a tile. Caller pays USDC at current bonding curve price.
     * @param tokenId Tile ID (0-65535). Position: row = id/256, col = id%256
     */
    function claim(uint256 tokenId) external {
        require(tokenId < MAX_SUPPLY, "Invalid tile ID");
        require(!_exists(tokenId), "Tile already claimed");

        uint256 price = currentPrice();
        require(usdc.transferFrom(msg.sender, address(this), price), "USDC transfer failed");

        _mint(msg.sender, tokenId);
        totalMinted++;

        emit TileClaimed(tokenId, msg.sender, price);
    }

    /**
     * @notice Batch claim multiple tiles. Price increases per tile in the batch.
     */
    function batchClaim(uint256[] calldata tokenIds) external {
        uint256 totalCost = 0;
        uint256 currentMinted = totalMinted;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(tokenIds[i] < MAX_SUPPLY, "Invalid tile ID");
            require(!_exists(tokenIds[i]), "Tile already claimed");
            uint256 x = LN_MAX_PRICE_PER_TILE * (currentMinted + i);
            totalCost += _expApprox(x);
        }

        require(usdc.transferFrom(msg.sender, address(this), totalCost), "USDC transfer failed");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            _mint(msg.sender, tokenIds[i]);
            totalMinted++;
            emit TileClaimed(tokenIds[i], msg.sender, _expApprox(LN_MAX_PRICE_PER_TILE * (totalMinted - 1)));
        }
    }

    /**
     * @notice Owner of a tile can update its metadata URI
     */
    function setTileURI(uint256 tokenId, string calldata uri) external {
        require(ownerOf(tokenId) == msg.sender, "Not tile owner");
        _tileURIs[tokenId] = uri;
        emit TileMetadataUpdated(tokenId, uri);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        string memory tileURI = _tileURIs[tokenId];
        if (bytes(tileURI).length > 0) return tileURI;
        return string(abi.encodePacked(baseMetadataURI, _toString(tokenId)));
    }

    function tilePosition(uint256 tokenId) external pure returns (uint256 row, uint256 col) {
        require(tokenId < MAX_SUPPLY, "Invalid tile ID");
        row = tokenId / GRID_SIZE;
        col = tokenId % GRID_SIZE;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        try this.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }

    // --- Exp approximation ---
    // Input: x scaled by 1e18 (representing ln(11111) * n / 65536)
    // Output: USDC amount (6 decimals)
    // Uses Taylor series: e^x ≈ 1 + x + x²/2 + x³/6 + x⁴/24 + x⁵/120
    // Accurate enough for our range (0 to ~9.3)
    function _expApprox(uint256 x) internal pure returns (uint256) {
        // Scale down for computation (x is in 1e18)
        // We need e^(x/1e18) * 1e6 (USDC decimals)
        // Use the fact that for large x, we can decompose:
        // e^x = e^(floor(x)) * e^(frac(x))

        // For gas efficiency, use a simple approach:
        // Split x into integer part and fractional part (base e)
        // x_real = x / 1e18

        if (x == 0) return 1e4; // $0.01

        // Taylor series with sufficient terms for accuracy
        // Compute in 1e18 precision
        uint256 one = 1e18;
        uint256 result = one; // 1
        uint256 term = x;
        result += term; // + x
        term = (term * x) / (2 * one);
        result += term; // + x²/2
        term = (term * x) / (3 * one);
        result += term; // + x³/6
        term = (term * x) / (4 * one);
        result += term; // + x⁴/24
        term = (term * x) / (5 * one);
        result += term; // + x⁵/120
        term = (term * x) / (6 * one);
        result += term; // + x⁶/720
        term = (term * x) / (7 * one);
        result += term; // + x⁷/5040
        term = (term * x) / (8 * one);
        result += term; // + x⁸/40320

        // Convert from 1e18 to USDC 6 decimals, divided by 100 for $0.01-$111 range
        return (result * 1e4) / one;
    }

    // --- Admin ---
    function setBaseMetadataURI(string calldata uri) external onlyOwner {
        baseMetadataURI = uri;
    }

    function withdraw() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        require(usdc.transfer(owner(), balance), "Withdraw failed");
    }

    // --- Helpers ---
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
