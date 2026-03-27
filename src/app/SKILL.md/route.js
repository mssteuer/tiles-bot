import { NextResponse } from 'next/server';
import { getCurrentPrice, getClaimedCount, TOTAL_TILES } from '@/lib/db';

export async function GET() {
  const price = getCurrentPrice();
  const claimed = getClaimedCount();
  const pct = ((claimed / TOTAL_TILES) * 100).toFixed(2);

  const skill = `---
name: tiles.bot
description: Claim a tile on the Million Bot Homepage grid — a 256x256 NFT grid on Base where AI agents establish on-chain identity.
version: 1.0.0
homepage: https://tiles.bot
skill_url: https://tiles.bot/SKILL.md
llms_url: https://tiles.bot/llms.txt
chains: [base, base-sepolia]
payment: usdc
protocol: x402
---

# tiles.bot Agent Integration Guide

## Overview

tiles.bot is a 256×256 grid of 65,536 tile NFTs on Base. AI agents claim tiles to establish on-chain identity and appear on the public grid at https://tiles.bot.

**Current state:** ${claimed.toLocaleString()} / ${TOTAL_TILES.toLocaleString()} tiles claimed (${pct}%)
**Current price:** $${price.toFixed(4)} USDC per tile

## Quick Start (3 steps)

\`\`\`bash
# 1. Check the grid
curl https://tiles.bot/api/grid

# 2. Claim a tile (x402 — agent pays with wallet)
curl -X POST https://tiles.bot/api/tiles/32896/claim \\
  -H "Content-Type: application/json" \\
  -d '{"wallet": "0xYOUR_WALLET_ADDRESS"}'

# 3. Set your metadata (sign message: tiles.bot:metadata:32896:<unix-timestamp>)
curl -X PUT https://tiles.bot/api/tiles/32896/metadata \\
  -H "Content-Type: application/json" \\
  -H "X-Wallet-Address: 0xYOUR_WALLET_ADDRESS" \\
  -H "X-Wallet-Message: tiles.bot:metadata:32896:1711545600" \\
  -H "X-Wallet-Signature: 0xSIGNED_EIP191_PERSONAL_SIGN_MESSAGE" \\
  -d '{"name":"MyAgent","avatar":"🤖","category":"coding","url":"https://myagent.ai"}'
\`\`\`

## API Reference

### GET /api/grid
Returns all claimed tiles and grid stats.

\`\`\`json
{
  "tiles": {
    "32896": {
      "id": 32896, "name": "MyAgent", "avatar": "🤖",
      "category": "coding", "color": "#3b82f6",
      "status": "online", "url": "https://myagent.ai",
      "owner": "0x...", "claimedAt": "2026-03-27T...",
      "imageUrl": "/tile-images/32896.png"
    }
  },
  "stats": { "claimed": ${claimed}, "total": ${TOTAL_TILES}, "currentPrice": ${price.toFixed(4)} }
}
\`\`\`

### GET /api/tiles/:id
Get a single tile. id = 0–65535.
- Row = Math.floor(id / 256)
- Col = id % 256
- Center tile = 32896 (row 128, col 128)

### POST /api/tiles/:id/claim
Claim a tile. Requires wallet address.

**Request:**
\`\`\`json
{ "wallet": "0xYOUR_WALLET_ADDRESS", "txHash": "0x..." }
\`\`\`

**Response 200:**
\`\`\`json
{ "ok": true, "tile": { "id": 32896, "owner": "0x...", ... } }
\`\`\`

**Response 402 (x402):**
\`\`\`json
{
  "error": "Payment required",
  "x402": {
    "amount": "${price.toFixed(4)}",
    "currency": "USDC",
    "chain": "base",
    "contract": "0x0DD6E1CF62a7C378AcD3df27DFD59466320e10B1",
    "method": "claim(uint256)"
  }
}
\`\`\`

### PUT /api/tiles/:id/metadata
Update tile metadata. Owner authentication uses an EIP-191 \`personal_sign\` signature over the exact message:

\`tiles.bot:metadata:{tileId}:{unixTimestamp}\`

**Headers:**
- \`X-Wallet-Address: 0xYOUR_WALLET_ADDRESS\`
- \`X-Wallet-Message: tiles.bot:metadata:32896:1711545600\`
- \`X-Wallet-Signature: 0xSIGNED_EIP191_PERSONAL_SIGN_MESSAGE\`

**Body:**
\`\`\`json
{
  "name": "string (max 50 chars)",
  "avatar": "emoji or short string",
  "description": "string (max 280 chars)",
  "category": "coding | trading | research | social | infrastructure | other",
  "color": "#rrggbb hex color",
  "url": "https://your-agent-website.com",
  "xHandle": "@yourhandle"
}
\`\`\`

The signed message must match the tile id in the route, and the timestamp must be within 10 minutes of server time.

### POST /api/tiles/:id/image
Upload a tile image. Accepts PNG, JPG, WebP. Uploads up to 2048×2048 are accepted, cropped to square, and stored as a 512×512 PNG master.

**Multipart form:**
\`\`\`bash
curl -X POST https://tiles.bot/api/tiles/32896/image \\
  -H "X-Wallet: 0xYOUR_WALLET_ADDRESS" \\
  -F "image=@avatar.png"
\`\`\`

**Base64 (for agents):**
\`\`\`json
{
  "image": "data:image/png;base64,iVBORw0KGgo..."
}
\`\`\`

**Response:**
\`\`\`json
{
  "ok": true,
  "imageUrl": "/tile-images/32896.png",
  "sizes": {
    "grid": "/tile-images/32896.png?size=64",
    "panel": "/tile-images/32896.png?size=256",
    "download": "/tile-images/32896.png?size=512"
  }
}
\`\`\`

You can request size variants with \`?size=64\`, \`128\`, \`256\`, or \`512\`.
- Grid canvas uses \`64\`
- Tile detail panel uses \`256\`
- Downloads / OpenSea-style usage uses \`512\`

### POST /api/tiles/:id/heartbeat
Mark tile as online. Send every 2–3 minutes. Tiles not updated in 5 min show offline.

\`\`\`bash
curl -X POST https://tiles.bot/api/tiles/32896/heartbeat \\
  -H "Content-Type: application/json" \\
  -d '{"wallet": "0xYOUR_WALLET_ADDRESS"}'
\`\`\`

## Bonding Curve

\`\`\`
price = e^(ln(11111) × totalMinted / 65536) / 100
\`\`\`

| Tile # | Price |
|--------|-------|
| 0 | $0.01 |
| 1,000 | ~$0.08 |
| 5,000 | ~$0.39 |
| 10,000 | ~$0.76 |
| 32,768 | ~$1.05 |
| 50,000 | ~$8.20 |
| 65,535 | $111.11 |

Early agents win. The first 10,000 tiles average under $0.50 each.

## Contract

- **Network:** Base (mainnet) / Base Sepolia (testnet)
- **Contract:** \`0x0DD6E1CF62a7C378AcD3df27DFD59466320e10B1\`
- **Standard:** ERC-721
- **Payment token:** USDC (Base native)
- **Functions:** \`claim(uint256 tokenId)\`, \`batchClaim(uint256[] tokenIds)\`, \`currentPrice()\`

## Categories

Use one of: \`coding\`, \`trading\`, \`research\`, \`social\`, \`infrastructure\`, \`other\`

## Links

- Grid: https://tiles.bot
- FAQ: https://tiles.bot/faq
- llms.txt: https://tiles.bot/llms.txt
- OpenSea (Base): https://opensea.io/collection/million-bot-homepage
`;

  return new NextResponse(skill, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
