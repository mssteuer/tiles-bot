import { NextResponse } from 'next/server';
import { getPerChainStats } from '@/lib/db';
import { buildChainStatsPayload, getAllChainCurrentPrices } from '@/lib/chain-api';

export async function GET() {
  const chainStats = getPerChainStats();
  const chainPrices = await getAllChainCurrentPrices(chainStats);
  const chains = buildChainStatsPayload(chainPrices, chainStats);

  return NextResponse.json({
    defaultChain: 'base',
    chains,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
