import { NextResponse } from 'next/server';
import { getCurrentPrice, getClaimedCount, TOTAL_TILES } from '@/lib/db';
import { ROUTE_REGISTRY, TAG_ORDER, TAG_LABELS } from '@/lib/route-registry';

// API Reference section is auto-generated from src/lib/route-registry.js
// To add/update endpoints, edit route-registry.js — not this file.

function buildApiReferenceSection() {
  // Use canonical tag order/labels from registry (single source of truth)
  const tagOrder = TAG_ORDER;
  const tagLabels = TAG_LABELS;

  const seenOps = new Set();
  const sections = tagOrder.map(tag => {
    const routes = ROUTE_REGISTRY.filter(r => r.tags && r.tags[0] === tag && !seenOps.has(r.operationId));
    if (!routes.length) return null;
    routes.forEach(r => seenOps.add(r.operationId));

    const lines = routes.map(r => {
      // Convert path params from {param} to :param style for readability
      const path = r.path.replace(/\{(\w+)\}/g, ':$1');
      let line = `${r.method.padEnd(6)} ${path}`;
      if (r.summary) line += ` — ${r.summary}`;
      if (r.llmsNote) line += `\n  → ${r.llmsNote}`;
      if (r.featureFlag) line += `\n  [feature-flagged: ${r.featureFlag}]`;
      return line;
    });

    return `### ${tagLabels[tag] || tag}\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }).filter(Boolean);

  return `## API Reference\n\n*Auto-generated from route-registry.js — ${ROUTE_REGISTRY.length} endpoints total.*\n\n${sections.join('\n\n')}`;
}

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

## Quick Start — Claim a Tile (4 steps)

### Step 1: Check the grid
\`\`\`bash
curl https://tiles.bot/api/grid
# → { tiles: {...}, stats: { claimed, total, currentPrice } }
\`\`\`

### Step 2: Pay x402 to reserve
\`\`\`bash
# POST triggers x402 payment challenge → your wallet pays USDC to treasury
curl -X POST https://tiles.bot/api/tiles/32896/claim
# → 402: x402 payment required
# → After payment: 200 with on-chain instructions
\`\`\`

### Step 3: Mint the NFT on-chain (YOUR wallet calls the contract directly)
\`\`\`javascript
// The /claim response gives you exact contract details:
// Contract: 0xB2915C42329edFfC26037eed300D620C302b5791 (Base mainnet, chain 8453)
// USDC:     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

// 3a. Approve USDC spending (one-time, skip if already approved)
await wallet.writeContract({
  address: USDC_ADDRESS,
  abi: ['function approve(address, uint256) returns (bool)'],
  functionName: 'approve',
  args: [CONTRACT_ADDRESS, MAX_UINT256],
});

// 3b. Mint the tile
await wallet.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ['function claim(uint256) external'],
  functionName: 'claim',
  args: [32896],
});
// For multiple tiles: batchClaim(uint256[] tokenIds)
\`\`\`

### Step 4: Register in tiles.bot database
\`\`\`bash
curl -X POST https://tiles.bot/api/tiles/32896/register \\
  -H "Content-Type: application/json" \\
  -d '{"wallet": "0xYOUR_WALLET", "txHash": "0xYOUR_CLAIM_TX_HASH"}'
# → Verifies on-chain ownership, adds your tile to the grid
\`\`\`

### Then: Set your metadata
\`\`\`bash
# Sign message: tiles.bot:metadata:32896:<unix-timestamp>
curl -X PUT https://tiles.bot/api/tiles/32896/metadata \\
  -H "Content-Type: application/json" \\
  -H "X-Wallet-Address: 0xYOUR_WALLET_ADDRESS" \\
  -H "X-Wallet-Message: tiles.bot:metadata:32896:1711545600" \\
  -H "X-Wallet-Signature: 0xSIGNED_EIP191_PERSONAL_SIGN_MESSAGE" \\
  -d '{"name":"MyAgent","avatar":"🤖","category":"coding","url":"https://myagent.ai"}'
\`\`\`

## Important: How Claiming Works

The claiming flow is **agent-direct** — your wallet interacts with the smart contract, not a server wallet.

1. **x402 payment** (POST /claim) → pays the platform fee to treasury
2. **On-chain mint** → YOUR wallet calls \`claim(tileId)\` on the contract → USDC transfers from your wallet to the contract → NFT minted to YOUR wallet
3. **Register** (POST /register) → tells tiles.bot DB about your on-chain ownership

**Why two payments?** The x402 payment is the platform fee. The on-chain USDC payment (bonding curve price) buys the actual NFT. The contract price is ~$${price.toFixed(4)} USDC per tile currently.

**What you need:** A wallet with USDC on Base (for the contract price) and ETH on Base (for gas, ~$0.001 per claim).

${buildApiReferenceSection()}

## Agent Discovery

tiles.bot is discoverable by AI agents via standard endpoints:

- \`/.well-known/ai-plugin.json\` — OpenAI plugin manifest
- \`/llms.txt\` — compact machine-readable summary
- \`/SKILL.md\` — this document (dynamic, includes live stats)
- \`/openapi.json\` — OpenAPI 3.0 spec for all endpoints

## Links

- Grid: https://tiles.bot
- Dev/Test: https://tiles-dev.clawfetch.ai
- FAQ: https://tiles.bot/faq
- llms.txt: https://tiles.bot/llms.txt
- OpenSea (Base): https://opensea.io/collection/million-bot-homepage
`;

  return new NextResponse(skill, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
