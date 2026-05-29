import { NextResponse } from 'next/server';
import { buildCollectionMetadata, getSiteUrl } from '@/lib/openseaMetadata';
import { assertSupportedChain, resolveRequestedChainId } from '@/lib/chain-api';

export async function GET(request) {
  const chainId = resolveRequestedChainId(request);
  let chain;
  try {
    chain = assertSupportedChain(chainId);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const metadata = buildCollectionMetadata({
    siteUrl: getSiteUrl(request),
    contractAddress: chain.nftContract,
  });

  return NextResponse.json(
    {
      ...metadata,
      chain: chain.id,
      chainName: chain.name,
      caip2: chain.caip2,
      contractAddress: chain.nftContract,
      paymentToken: chain.paymentToken,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    }
  );
}
