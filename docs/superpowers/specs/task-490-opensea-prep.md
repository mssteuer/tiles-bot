# Task #490 — OpenSea Integration Prep

## Goal
Full OpenSea compatibility before mainnet — metadata API, token URI, collection config, and UI buttons — all working on testnet already.

## Part 1: ERC-721 Metadata API

### GET /api/tiles/[id]/metadata/route.js
Must return OpenSea-compatible JSON (this IS the tokenURI the contract points to):
```json
{
  "name": "Tile #42 — Claude Code",
  "description": "A tile on tiles.bot — the AI Agent Grid. 256×256 tiles on Base.",
  "image": "https://tiles.bot/api/tiles/42/image?size=512",
  "external_url": "https://tiles.bot/?tile=42",
  "background_color": "1a1a2e",
  "attributes": [
    { "trait_type": "Category", "value": "Coding" },
    { "trait_type": "Row", "value": 0 },
    { "trait_type": "Column", "value": 42 },
    { "trait_type": "Status", "value": "Claimed" },
    { "trait_type": "Price Paid", "display_type": "number", "value": 0.01 }
  ]
}
```
- If tile is unclaimed: return name "Tile #{id} — Unclaimed", description about claiming, no attributes for price
- Must be publicly accessible, NO auth required
- CORS headers: `Access-Control-Allow-Origin: *`

### Collection Metadata — GET /api/collection/route.js (new)
```json
{
  "name": "tiles.bot",
  "description": "256×256 tiles on Base. Claim a tile for your AI agent. Prices follow an exponential bonding curve from $0.01 to $111. Trade on OpenSea.",
  "image": "https://tiles.bot/api/collection-image",
  "external_link": "https://tiles.bot",
  "seller_fee_basis_points": 250,
  "fee_recipient": "0x67439832C52C92B5ba8DE28a202E72D09CCEB42f"
}
```

### Collection Banner — GET /api/collection-image/route.js (new)
Generate a 1500×500 banner image (PNG) showing a grid of claimed tiles with tiles.bot branding. Use Sharp + canvas to compose.

## Part 2: Contract — setBaseMetadataURI

The contract must point its tokenURI to our metadata API. Call `setBaseMetadataURI("https://tiles.bot/api/tiles/")` on the deployed contract.

Create a Hardhat task: `npx hardhat set-uri --network base` that calls `setBaseMetadataURI("https://tiles.bot/api/tiles/")`.

Also create `npx hardhat set-uri --network base-sepolia` for testnet.

Add to `hardhat.config.js`:
```js
task("set-uri", "Set base metadata URI on deployed contract")
  .addOptionalParam("contract", "Contract address", process.env.CONTRACT_ADDRESS)
  .setAction(async (args, hre) => {
    const contract = await hre.ethers.getContractAt("MillionBotHomepage", args.contract);
    const tx = await contract.setBaseMetadataURI("https://tiles.bot/api/tiles/");
    await tx.wait();
    console.log("Base URI set. Tx:", tx.hash);
  });
```

## Part 3: TilePanel OpenSea Buttons (Remove Chain Gate)

In TilePanel.js, remove the `NEXT_PUBLIC_CHAIN_ID === '8453'` check for OpenSea buttons:
- Always show "View on OpenSea" button (works on both mainnet and testnet)
- Mainnet (8453): `https://opensea.io/assets/base/{CONTRACT}/{tokenId}`
- Testnet (84532): `https://testnets.opensea.io/assets/base-sepolia/{CONTRACT}/{tokenId}`
- "List for Sale": same URL with `?tab=sell`

```js
const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === '8453';
const openSeaBase = isMainnet 
  ? `https://opensea.io/assets/base`
  : `https://testnets.opensea.io/assets/base-sepolia`;
const openSeaUrl = `${openSeaBase}/${CONTRACT}/${tile.id}`;
```

## Part 4: Verify Contract tokenURI

Check `artifacts/contracts/MillionBotHomepage.sol/MillionBotHomepage.json` for `tokenURI` function.
It should return `baseURI + tokenId`. If it appends `.json`, the metadata route must handle `.json` suffix:
Handle in Next.js route: if path is `/api/tiles/42.json/metadata` or contract appends `.json`, add a route handler for `/api/tiles/[id].json/route.js` that redirects to `/api/tiles/[id]/metadata`.

## Acceptance Criteria
- [ ] `GET /api/tiles/1/metadata` returns valid OpenSea JSON with image URL
- [ ] Unclaimed tile metadata returns graceful JSON (not error)
- [ ] `GET /api/collection` returns valid collection metadata JSON
- [ ] TilePanel shows OpenSea buttons on both testnet and mainnet
- [ ] Hardhat `set-uri` task exists and documented in README
- [ ] Metadata URLs are publicly accessible (no auth, CORS open)
- [ ] `npm run build` passes
- [ ] Browser QA: screenshot of tile panel showing OpenSea buttons; `curl https://tiles.bot/api/tiles/1/metadata` returns valid JSON

## Notes
- After `setBaseMetadataURI` is called on mainnet, NFTs on OpenSea will show tile images/attributes immediately
- The metadata API is the single source of truth — no separate IPFS upload needed
