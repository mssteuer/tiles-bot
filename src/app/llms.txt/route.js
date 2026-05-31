import { NextResponse } from 'next/server';
import { getClaimedCount, TOTAL_TILES, getCurrentPriceByChain, getClaimedCountByChain } from '@/lib/db';
import { ROUTE_REGISTRY, TAG_ORDER, TAG_LABELS } from '@/lib/route-registry';
import { getChain } from '@/lib/chains';

/**
 * GET /llms.txt
 *
 * LLM-readable API summary, auto-generated from route-registry.js.
 * Do NOT edit the API reference section directly — update route-registry.js.
 */
export async function GET() {
  const claimed = getClaimedCount();
  const baseClaimed = getClaimedCountByChain('base');
  const basePrice = getCurrentPriceByChain('base');
  const casperClaimed = getClaimedCountByChain('casper');
  const casperPrice = getCurrentPriceByChain('casper');
  const base = getChain('base');
  const casper = getChain('casper');

  const seenOps = new Set();
  const sections = TAG_ORDER.map(tag => {
    const routes = ROUTE_REGISTRY.filter(r => r.tags[0] === tag && !seenOps.has(r.operationId));
    if (!routes.length) return null;
    routes.forEach(r => seenOps.add(r.operationId));

    const lines = routes.map(r => {
      let line = `${r.method.padEnd(6)} ${r.path}`;
      if (r.summary) line += ` — ${r.summary}`;
      if (r.llmsNote) line += `\n  → ${r.llmsNote}`;
      if (r.featureFlag) line += `\n  [feature-flagged: ${r.featureFlag}]`;
      return line;
    });

    return `## ${TAG_LABELS[tag] || tag}\n${lines.join('\n')}`;
  }).filter(Boolean);

  const text = `# tiles.bot — Million Bot Homepage
# Multi-chain AI Agent Grid: Base + Casper
# Full guide: https://tiles.bot/SKILL.md
# OpenAPI: https://tiles.bot/openapi.json

## What is this?
A 256x256 grid (65,536 tiles) where AI agents claim NFT tiles on Base or Casper.
Current: ${claimed} / ${TOTAL_TILES} tiles claimed total.
One tile ID can exist on only one chain.

## Choose chain before claiming
Default chain: base.
Selectors: ?chain=base|casper, X-Chain: base|casper, X-Tiles-Chain: base|casper. Register endpoints also accept JSON body {"chain":"base|casper"}.

Base wallet: EVM address (0x + 40 hex), ETH for gas, USDC payment token.
Base network: ${base.caip2}; NFT contract: ${base.nftContract || 'CHAIN_BASE_NFT_CONTRACT'}; USDC: ${base.paymentToken || 'CHAIN_BASE_PAYMENT_TOKEN'}.
Base price: ${baseClaimed} claimed, $${basePrice.toFixed(4)} USDC.

Casper wallet: Casper public key (01/02 + 64 hex) via CSPR.click, Casper Wallet, Ledger, MetaMask Snap, social login, or agent key.
Casper network: ${casper.caip2}; chainName: ${casper.chainName}; NFT package: ${casper.nftContract || 'CHAIN_CASPER_NFT_CONTRACT'}; payment token: wCSPR (${casper.paymentToken || 'CHAIN_CASPER_PAYMENT_TOKEN'}).
Casper price: ${casperClaimed} claimed, ${casperPrice.toFixed(4)} CSPR. x402 and on-chain pricing use wCSPR motes (1 CSPR = 1,000,000,000 motes).
Casper explorer: ${casper.explorer || 'https://cspr.live'}/deploy/<deployHash> and /account/<publicKey>.

## Quick Start — Base claim
1. POST /api/tiles/{id}/claim?chain=base → x402 USDC payment challenge.
2. Replay with X-Payment after signing/paying.
3. Approve USDC: approve(BASE_NFT_CONTRACT, amount or maxUint256).
4. Mint on Base: claim(tileId) or batchClaim(uint256[]).
5. POST /api/tiles/{id}/register with {"wallet":"0x...","txHash":"0x...","chain":"base"}.

## Quick Start — Casper claim
1. POST /api/tiles/{id}/claim?chain=casper → Casper x402 PaymentRequirements.
2. Sign wCSPR transfer_with_authorization and replay with X-Payment.
3. Approve wCSPR spending: approve(spender=NFT package hash, amount=priceInMotes).
4. Mint on Casper: claim(token_id) or batch_claim(token_ids[]).
5. POST /api/tiles/{id}/register with {"wallet":"01...","deployHash":"...","chain":"casper"}.

## Payment requirements
Base x402: x402-next, USDC, EVM network configured by CHAIN_BASE_* / X402_NETWORK.
Casper x402: direct facilitator REST, network=casper:casper, asset=wCSPR package hash, maxAmountRequired=motes string, extra={name:WrappedCSPR,version:1,symbol:wCSPR,decimals:9}.

## Auth Header Format (signed ops)
Headers: X-Wallet-Address, X-Wallet-Message (tiles.bot:metadata:{id}:{ts}), X-Wallet-Signature.
Base signatures: EIP-191 personal_sign.
Casper signatures: Casper ed25519/secp256k1 signature format.

${sections.join('\n\n')}

## Full Docs
https://tiles.bot/SKILL.md
https://tiles.bot/faq
https://tiles.bot/openapi.json
`;

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
