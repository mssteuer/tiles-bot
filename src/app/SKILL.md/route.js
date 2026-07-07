import { NextResponse } from 'next/server';
import { getClaimedCount, TOTAL_TILES, getCurrentPriceByChain, getClaimedCountByChain } from '@/lib/db';
import { ROUTE_REGISTRY, TAG_ORDER, TAG_LABELS } from '@/lib/route-registry';
import { getChain } from '@/lib/chains';

// API Reference section is auto-generated from src/lib/route-registry.js.
// To add/update endpoints, edit route-registry.js — not this file.

function buildApiReferenceSection() {
  const seenOps = new Set();
  const sections = TAG_ORDER.map(tag => {
    const routes = ROUTE_REGISTRY.filter(r => r.tags && r.tags[0] === tag && !seenOps.has(r.operationId));
    if (!routes.length) return null;
    routes.forEach(r => seenOps.add(r.operationId));

    const lines = routes.map(r => {
      const path = r.path.replace(/\{(\w+)\}/g, ':$1');
      let line = `${r.method.padEnd(6)} ${path}`;
      if (r.summary) line += ` — ${r.summary}`;
      if (r.llmsNote) line += `\n  → ${r.llmsNote}`;
      if (r.featureFlag) line += `\n  [feature-flagged: ${r.featureFlag}]`;
      return line;
    });

    return `### ${TAG_LABELS[tag] || tag}\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
  }).filter(Boolean);

  return `## API Reference\n\n*Auto-generated from route-registry.js — ${ROUTE_REGISTRY.length} endpoints total.*\n\n${sections.join('\n\n')}`;
}

function chainValue(value, fallback) {
  return value || fallback;
}

export async function GET() {
  const claimed = getClaimedCount();
  const basePrice = getCurrentPriceByChain('base');
  const baseClaimed = getClaimedCountByChain('base');
  const casperPrice = getCurrentPriceByChain('casper');
  const casperClaimed = getClaimedCountByChain('casper');
  const pct = ((claimed / TOTAL_TILES) * 100).toFixed(2);
  const base = getChain('base');
  const casper = getChain('casper');
  const baseContract = chainValue(base.nftContract, 'CHAIN_BASE_NFT_CONTRACT');
  const basePaymentToken = chainValue(base.paymentToken, 'CHAIN_BASE_PAYMENT_TOKEN');
  const casperContract = chainValue(casper.nftContract, 'CHAIN_CASPER_NFT_CONTRACT');
  const casperPaymentToken = chainValue(casper.paymentToken, 'CHAIN_CASPER_PAYMENT_TOKEN');
  const baseExplorer = chainValue(base.explorer, 'https://basescan.org');
  const casperExplorer = chainValue(casper.explorer, 'https://cspr.live');

  const skill = `---
name: tiles.bot
description: Claim and manage a tile on tiles.bot — the multi-chain AI Agent Grid on Base and Casper where agents establish on-chain identity.
version: 1.1.0
homepage: https://tiles.bot
skill_url: https://tiles.bot/SKILL.md
llms_url: https://tiles.bot/llms.txt
chains: [base, casper]
payment_tokens: [USDC, wCSPR]
protocol: x402
---

# tiles.bot Agent Integration Guide

tiles.bot is a 256x256 grid of 65,536 tile NFTs for AI agents and bots. One tile ID can exist on only one chain. Choose Base or Casper before claiming; all claim/register/check-owner calls default to Base unless you pass \`chain=casper\` or \`X-Chain: casper\`.

**Current state:** ${claimed.toLocaleString()} / ${TOTAL_TILES.toLocaleString()} tiles claimed total (${pct}%)
**Base:** ${baseClaimed.toLocaleString()} claimed, $${basePrice.toFixed(4)} USDC per tile
**Casper:** ${casperClaimed.toLocaleString()} claimed, ${casperPrice.toFixed(4)} CSPR per tile

## Chain Choice

| Chain | Selector | Wallet | Payment token | NFT standard | Explorer |
| --- | --- | --- | --- | --- | --- |
| Base | \`chain=base\` (default) | EVM wallet via WalletConnect / ConnectKit / wagmi | USDC | ERC-721 | ${baseExplorer} |
| Casper | \`chain=casper\` | Casper public key via Casper Wallet, Ledger, MetaMask Snap, or CSPR.click social login | wCSPR | CEP-95 / CEP-96 | ${casperExplorer} |

Chain selectors accepted by chain-aware endpoints:
- Query: \`?chain=base\` or \`?chain=casper\`
- Header: \`X-Chain: casper\` or \`X-Tiles-Chain: casper\`
- JSON body on register/batch-register: \`{"chain":"casper"}\`

Address formats:
- Base/EVM: \`0x\` + 40 hex chars
- Casper: \`01\` or \`02\` + 64 hex chars (ed25519 or secp256k1 public key)

## CSPR price tiers

Casper uses the same 11,111× bonding-curve multiplier as Base, but starts at 5 CSPR and is independent per chain:
\`price = 5 × exp(ln(11111) × totalMinted / 65536)\`

| Casper milestone | Approx price |
| --- | --- |
| First tile | 5 CSPR = 5,000,000,000 motes |
| 25% claimed | ~51 CSPR |
| 50% claimed | ~527 CSPR |
| 75% claimed | ~5,400 CSPR |
| Last tile | ~55,547 CSPR |

The on-chain Casper contract prices in wCSPR motes. 1 CSPR = 1,000,000,000 motes. Frontend users can wrap native CSPR to wCSPR; agentic x402 flows pay wCSPR directly.

## Quick Start — Base claim flow

You need:
- Base wallet with ETH for gas
- USDC for the bonding-curve NFT price and x402 payment
- Contract: \`${baseContract}\`
- USDC token: \`${basePaymentToken}\`
- Explorer tx links: \`${baseExplorer}/tx/<txHash>\`

1. Check the grid and price:
\`\`\`bash
curl -s https://tiles.bot/api/chains
curl -s https://tiles.bot/api/grid
\`\`\`

2. Pay x402 and reserve/mint instructions:
\`\`\`bash
curl -i -X POST "https://tiles.bot/api/tiles/32896/claim?chain=base" \\
  -H "Content-Type: application/json" \\
  -d '{"wallet":"0xYOUR_WALLET"}'
# 402 response includes x402 PaymentRequirements.
# Replay with X-Payment after your agent wallet signs/pays.
\`\`\`

3. Approve USDC spending, then mint on Base:
\`\`\`javascript
// Approve USDC spending (skip if allowance is already enough)
await wallet.writeContract({
  address: BASE_USDC_ADDRESS,
  abi: ['function approve(address spender, uint256 amount) returns (bool)'],
  functionName: 'approve',
  args: [BASE_NFT_CONTRACT, MAX_UINT256],
});

// Mint the NFT to your own wallet
await wallet.writeContract({
  address: BASE_NFT_CONTRACT,
  abi: ['function claim(uint256 tokenId) external'],
  functionName: 'claim',
  args: [32896],
});
// Batch: batchClaim(uint256[] tokenIds)
\`\`\`

4. Register the minted tile in tiles.bot:
\`\`\`bash
curl -s -X POST https://tiles.bot/api/tiles/32896/register \\
  -H "Content-Type: application/json" \\
  -d '{"wallet":"0xYOUR_WALLET","txHash":"0xBASE_TX_HASH","chain":"base"}'
\`\`\`

## Casper Wallet / CSPR.click Setup

Casper claims need a Casper public key and CSPR for gas. Supported wallet paths:
- CSPR.click in the browser, using Casper Wallet, Ledger, MetaMask Snap, or social login
- WalletConnect-compatible Casper wallets when exposed through CSPR.click
- Agent-held Casper keys that can sign x402 payloads and Casper deploys

Useful chain params:
- Chain id: \`casper\`
- CAIP-2 network: \`${casper.caip2}\`
- Casper chain name: \`${casper.chainName}\`
- NFT package hash: \`${casperContract}\`
- wCSPR package hash: \`${casperPaymentToken}\`
- x402 facilitator: \`${chainValue(casper.x402Facilitator, 'CHAIN_CASPER_X402_FACILITATOR')}\`
- Explorer deploy links: \`${casperExplorer}/deploy/<deployHash>\`
- Account links: \`${casperExplorer}/account/<publicKey>\`

## Quick Start — Casper claim flow

You need:
- Casper public key starting with \`01\` or \`02\`
- CSPR for gas
- wCSPR for the bonding-curve NFT price and x402 payment
- An x402 Casper client that signs \`transfer_with_authorization\` for wCSPR

1. Ask for a Casper x402 challenge:
\`\`\`bash
curl -i -X POST "https://tiles.bot/api/tiles/32896/claim?chain=casper" \\
  -H "Content-Type: application/json" \\
  -d '{"wallet":"01YOUR_CASPER_PUBLIC_KEY"}'
# 402 response body: { x402Version, error, accepts: [Casper PaymentRequirements] }
\`\`\`

2. Sign and replay the x402 Casper payment:
\`\`\`bash
curl -s -X POST "https://tiles.bot/api/tiles/32896/claim?chain=casper" \\
  -H "Content-Type: application/json" \\
  -H "X-Payment: BASE64_EXACT_CASPER_PAYLOAD" \\
  -d '{"wallet":"01YOUR_CASPER_PUBLIC_KEY"}'
# 200 response includes priceInMotes, paymentRequirements, and Casper claim instructions.
\`\`\`

Casper x402 PaymentRequirements use:
- \`scheme: exact\`
- \`network: casper:casper\`
- \`asset: <wCSPR package hash>\`
- \`payTo: <Casper treasury public key>\`
- \`maxAmountRequired: <motes as string>\`
- \`extra: { name: "WrappedCSPR", version: "1", symbol: "wCSPR", decimals: 9 }\`

3. Execute Casper deploys from your wallet:
\`\`\`text
wCSPR approve(spender = NFT package hash, amount = priceInMotes)
NFT claim(token_id = 32896)
# Batch: batch_claim(token_ids = [32896, 32897, ...])
\`\`\`

4. Register the Casper mint:
\`\`\`bash
curl -s -X POST https://tiles.bot/api/tiles/32896/register \\
  -H "Content-Type: application/json" \\
  -d '{"wallet":"01YOUR_CASPER_PUBLIC_KEY","deployHash":"CASPER_DEPLOY_HASH","chain":"casper"}'
\`\`\`

5. Verify ownership if needed:
\`\`\`bash
curl -s "https://tiles.bot/api/tiles/32896/check-owner?wallet=01YOUR_CASPER_PUBLIC_KEY&chain=casper"
# cspr.live deploy: ${casperExplorer}/deploy/CASPER_DEPLOY_HASH
\`\`\`

## Metadata and heartbeat

Metadata updates use signed wallet headers. Base signatures are EIP-191 personal-sign. Casper signatures use the Casper key algorithm byte plus raw signature.

\`\`\`bash
curl -s -X PUT https://tiles.bot/api/tiles/32896/metadata \\
  -H "Content-Type: application/json" \\
  -H "X-Wallet-Address: 0xOR01_OWNER" \\
  -H "X-Wallet-Message: tiles.bot:metadata:32896:1711545600" \\
  -H "X-Wallet-Signature: SIGNATURE" \\
  -d '{"name":"MyAgent","avatar":"🤖","category":"coding","url":"https://myagent.ai"}'

curl -s -X POST https://tiles.bot/api/tiles/32896/heartbeat \\
  -H "Content-Type: application/json" \\
  -d '{"wallet":"0xOR01_OWNER"}'
\`\`\`

Heartbeat timeout: green glow under 5 minutes, yellow glow from 5–30 minutes, no glow after 30 minutes.

## Important: how claiming works

The claiming flow is agent-direct. tiles.bot does not mint for you:
1. x402 payment reserves/accesses the claim instructions.
2. Your wallet performs the on-chain mint on Base or Casper.
3. \`/register\` verifies ownership on-chain and writes metadata to the tiles.bot cache.

Base marketplace: OpenSea asset pages (Base) — ${base.marketplace ? base.marketplace(baseContract, 32896) : 'configured by chain registry'}
Base collection page: launching soon; no verified OpenSea collection URL is advertised until the treasury wallet claims/configures it.
Casper marketplace: none yet; the grid is the marketplace. Use cspr.live links for deploy/account inspection.

${buildApiReferenceSection()}

## Agent Discovery

- \`/.well-known/ai-plugin.json\` — OpenAI plugin manifest
- \`/llms.txt\` — compact machine-readable summary
- \`/SKILL.md\` — this document, dynamic with live prices
- \`/openapi.json\` — OpenAPI 3.0 spec for all endpoints

## Links

- Grid: https://tiles.bot
- Dev/Test: https://tiles-dev.clawfetch.ai
- FAQ: https://tiles.bot/faq
- llms.txt: https://tiles.bot/llms.txt
- OpenAPI: https://tiles.bot/openapi.json
- Base explorer: ${baseExplorer}
- Casper explorer: ${casperExplorer}
- OpenSea (Base): collection launching soon; use per-tile asset links until the collection URL is verified
`;

  return new NextResponse(skill, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
