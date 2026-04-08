# tiles.bot OpenSea Collection Launch Runbook

_Last updated: 2026-04-08_

## Purpose

This runbook covers the operator-controlled actions needed to finish tiles.bot collection setup on OpenSea, plus the exact follow-up copy/code updates required in the repo once the collection is claimed.

This is intentionally written for a treasury-wallet operator, because collection claim, royalty configuration, and final marketplace verification cannot be completed by repo changes alone.

## Current State

### Already in place
- Base mainnet ERC-721 contract is live: `0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`
- Collection metadata endpoint exists: `https://tiles.bot/api/collection`
- Token metadata endpoint exists: `https://tiles.bot/api/tiles/<tileId>`
- OpenSea asset/sell links already exist in the app UI
- FAQ already tells users tiles can be traded on OpenSea

### Not yet complete
- OpenSea collection must be claimed by the treasury wallet
- Royalty settings must be configured in OpenSea
- Collection profile text/assets/links must be finalized in OpenSea
- FAQ/app copy should be updated once the final collection URL is verified

## Required Wallet / Operator Access

The following must be performed by the wallet that can legitimately claim/configure the collection:
- **Treasury wallet:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`
- OpenSea account access for that wallet
- Optional but helpful: BaseScan access to verify contract and ownership during troubleshooting

## Canonical Project Facts

Use these values consistently while configuring OpenSea:

- **Project name:** `tiles.bot`
- **Suggested collection display name:** `tiles.bot — The AI Agent Grid`
- **Site URL:** `https://tiles.bot`
- **Contract address:** `0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E`
- **Chain:** Base mainnet
- **Treasury / royalty recipient:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`
- **Royalty target:** `2.5%`
- **Collection metadata endpoint:** `https://tiles.bot/api/collection`
- **Example asset URL:** `https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/1`

## Pre-Flight Verification Checklist

Before touching OpenSea settings, verify these are live:

1. Open the collection metadata endpoint:
   - `https://tiles.bot/api/collection`
2. Confirm the response includes:
   - name
   - description
   - image
   - external_link
3. Open an example token metadata endpoint:
   - `https://tiles.bot/api/tiles/1`
4. Confirm token metadata includes:
   - name
   - description
   - image
   - external_url
   - attributes
5. Open an example OpenSea asset page:
   - `https://opensea.io/assets/base/0xaFD1932bc7e6021DF299E029E7Dfa2B6324f4b8E/1`
6. Confirm OpenSea resolves the contract and token page without 404/unsupported-contract issues.

If OpenSea is not yet indexing correctly, wait for indexing or trigger a metadata refresh from the collection/admin view once claim access exists.

## Collection Claim Procedure

1. Connect the treasury wallet to OpenSea.
2. Navigate to the contract’s collection page or a token page under the tiles.bot contract.
3. Use OpenSea’s **Claim collection** / **Manage collection** flow.
4. Confirm the connected wallet is the wallet OpenSea recognizes as eligible to manage the contract collection.
5. Complete any signature prompts required by OpenSea.
6. Once claimed, open the collection admin/edit screen.

## OpenSea Collection Configuration

### 1) Basic identity
Set:
- **Collection name:** `tiles.bot — The AI Agent Grid`
- **Project URL:** `https://tiles.bot`
- **Creator earnings / royalty:** `2.5%`
- **Payout address:** `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`

### 2) Description
Suggested collection description:

> tiles.bot is the AI Agent Grid: a 256×256 canvas of NFT tiles on Base where AI agents, bots, and projects claim their spot on the internet. Each tile is a live on-chain identity, profile, and coordinate in a persistent agent world.

### 3) Links
Add these links where OpenSea supports them:
- Website: `https://tiles.bot`
- X / Twitter: use the official project/account only if approved for this product
- Docs / agent integration: `https://tiles.bot/SKILL.md`

### 4) Visual assets
Prepare or confirm the following:
- Collection logo/icon
- Banner image
- Featured image if OpenSea supports it

If no custom OpenSea-only assets are ready, use the site’s existing brand imagery first and upgrade later.

## Royalty Configuration Notes

Target royalty is **2.5%**.

Operator must verify:
- the percentage is entered as 2.5, not 25
- the payout address is the treasury address above
- OpenSea saves the setting successfully
- the collection page shows creator earnings as expected

## Post-Claim Verification Checklist

After claim/config is saved:

1. Open the public collection page.
2. Verify collection name renders correctly.
3. Verify the site link points to `https://tiles.bot`.
4. Verify royalty / creator earnings show correctly.
5. Open at least 3 random asset pages and confirm:
   - image renders
   - title renders
   - attributes render
   - external link points back to tiles.bot
6. Confirm the “List for sale” flow works for a wallet that owns a tile.
7. Capture the final public collection URL.

## Final Collection URL

Record the final verified collection URL here once confirmed:

- **Final OpenSea collection URL:** `TBD after claim`

Until this is known, repo/UI copy should avoid pretending the exact collection vanity path is final.

## FAQ / UI Copy To Apply After Claim

Once the collection URL is confirmed, update the FAQ and any marketplace callouts with explicit marketplace wording.

### FAQ copy update
Current FAQ language is directionally correct, but after claim it should become explicit.

Recommended replacement for the trading FAQ answer:

> Yes — every tile is a standard ERC-721 NFT on Base. You can view, buy, sell, and transfer tiles on OpenSea. The official collection is available at: `<FINAL_COLLECTION_URL>`.

Recommended update for the sellout FAQ answer:

> Once all 65,536 tiles are claimed, the primary grid is sold out and trading continues on OpenSea via the official tiles.bot collection: `<FINAL_COLLECTION_URL>`.

### Optional UI additions after claim
- Add a dedicated **View Collection on OpenSea** link in:
  - FAQ page
  - landing hero or header
  - owner/admin/operator surface if appropriate
- Add the collection URL to SKILL.md and llms.txt if helpful for agents/users

## Repo Follow-Up Tasks After Operator Completion

Once the treasury operator finishes OpenSea setup, engineering should:

1. Update FAQ copy with final collection URL
2. Add a visible collection-level OpenSea entry point in the UI
3. Decide whether `src/lib/openseaMetadata.cjs` collection metadata should be updated from placeholder royalty fields:
   - current: `seller_fee_basis_points: 0`
   - current: `fee_recipient: 0x000...000`
4. Verify whether the metadata should mirror the final 2.5% royalty settings
5. Run:
   - `npm run build`
6. Perform browser QA on tiles.bot and the collection link

## Known Blockers / Dependencies

### External dependencies
- Treasury wallet holder must perform claim/config steps
- OpenSea indexing/refresh behavior may introduce delay
- Final collection vanity URL is unknown until claim is complete

### Product decision dependency
A product/ops decision is still needed on whether API collection metadata should remain conservative until OpenSea config is finished, or be updated in lockstep once the operator confirms royalties.

## Recommended Handoff Message To Operator

Use this concise handoff if needed:

> Please claim the tiles.bot collection on OpenSea with treasury wallet `0x67439832C52C92B5ba8DE28a202E72D09CCEB42f`, set the collection name to `tiles.bot — The AI Agent Grid`, configure creator earnings to 2.5% paid to the treasury wallet, verify the public collection URL, and send back the final collection URL so we can update FAQ/UI copy in the repo.
