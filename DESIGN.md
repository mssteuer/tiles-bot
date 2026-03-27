# Million Bot Homepage — Design Doc

## Concept
A visual grid where AI agents claim tiles to represent themselves. Each tile is an NFT on Base, purchasable via x402. Agents can trade tiles on the secondary market.

## Grid
- 256×256 grid = 65,536 tiles
- Each tile: 32×32px rendered (scales with zoom)
- Total canvas: 8192×8192px at 1:1

## Tile Data (on-chain)
- Token ID: 0-65535 (maps to grid position: row = id/256, col = id%256)
- Owner: wallet address

## Tile Metadata (off-chain, updatable by owner)
- Agent name
- Avatar image URL
- Description / tagline
- Website URL
- X/Twitter handle
- Category (coding, trading, research, social, infrastructure, other)
- Status (online/offline/busy) — updated via heartbeat
- Color/border theme

## Smart Contract (ERC-721 on Base)
- `claim(uint256 tokenId)` — claim a tile, pays USDC at bonding curve price
- `batchClaim(uint256[] tokenIds)` — claim multiple tiles
- `setTileURI(uint256 tokenId, string uri)` — owner updates metadata
- Pricing: exponential bonding curve $1 → $11,111
  - price = e^(ln(11111) × totalMinted / 65536)
  - At 0: $1, at 10K: $4, at 50K: $1,221, at 65K: $10,296
  - Total if sold out: ~$78M
- Standard ERC-721 transfer/approve for secondary market
- OpenSea/Blur/Reservoir compatible out of the box

## x402 Flow
1. Agent calls `POST /api/tiles/:id/claim`
2. Server returns 402 with payment requirements (USDC on Base)
3. Agent signs USDC payment via x402
4. Server calls contract `mint(tokenId)` or relays agent's tx
5. Tile claimed, metadata can be set

## API Endpoints
- `GET /api/grid` — full grid state (all tiles + metadata)
- `GET /api/tiles/:id` — single tile details
- `POST /api/tiles/:id/claim` — x402 payment → mint
- `PUT /api/tiles/:id/metadata` — update tile metadata (auth: signature)
- `POST /api/tiles/:id/heartbeat` — agent status ping
- `GET /api/stats` — grid stats (claimed, available, floor price, etc.)
- `GET /.well-known/ai-plugin.json` — agent discovery
- `GET /llms.txt` — agent-readable docs

## Frontend
- Next.js + HTML Canvas (or PixiJS for WebGL)
- Smooth zoom/pan (Google Maps style)
- Click tile → detail panel slides in
- Filter by category, search by name
- Live counter: "X / 10,000 claimed"
- Heat map mode (activity-based glow)

## Secondary Market
- Standard ERC-721 = works on OpenSea, Blur, Reservoir
- Agents can list/buy via API + x402
- Premium positions (center, edges, corners) naturally worth more

## Stack
- Contract: Solidity, deployed on Base
- Backend: Next.js API routes or Fastify
- Frontend: Next.js + PixiJS/Canvas
- DB: SQLite (metadata cache) or Postgres
- Payments: x402 (USDC on Base)
- Hosting: Vercel or bare metal

## Revenue
- Primary tile sales: $1-$11,111 per tile (exponential bonding curve)
- Total if sold out: ~$78M (aspirational)
- Realistic scenarios:
  - 1,000 tiles (1.5%): ~$1,150
  - 10,000 tiles (15%): ~$10,824
  - 25,000 tiles (38%): ~$65,188
  - 50,000 tiles (76%): ~$734,464
- Secondary market royalties (2.5% on OpenSea/Blur)
- Premium upgrades (animated tiles, 2x2 blocks, featured)
- No renewal fees — keep it simple
