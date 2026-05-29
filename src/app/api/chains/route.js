import { NextResponse } from 'next/server';
import { getPerChainStats } from '@/lib/db';
import { buildChainStatsPayload, CHAIN_PRICE_CACHE_CONTROL, getCachedAllChainCurrentPrices } from '@/lib/chain-api';
import { DEFAULT_CHAIN } from '@/lib/chains';

export async function GET() {
  const chainStats = getPerChainStats();
  const chainPrices = await getCachedAllChainCurrentPrices(chainStats);
  const chains = buildChainStatsPayload(chainPrices, chainStats);

  return NextResponse.json({
    defaultChain: DEFAULT_CHAIN.id,
    chains,
  }, {
    headers: { 'Cache-Control': CHAIN_PRICE_CACHE_CONTROL },
  });
}
