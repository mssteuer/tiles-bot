import { NextResponse } from 'next/server';
import { getPerChainStats } from '@/lib/db';
import { buildChainStatsPayload, getAllChainCurrentPrices } from '@/lib/chain-api';
import { DEFAULT_CHAIN } from '@/lib/chains';

export async function GET() {
  const chainStats = getPerChainStats();
  const chainPrices = await getAllChainCurrentPrices(chainStats);
  const chains = buildChainStatsPayload(chainPrices, chainStats);

  return NextResponse.json({
    defaultChain: DEFAULT_CHAIN.id,
    chains,
  }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  });
}
