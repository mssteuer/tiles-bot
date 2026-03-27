import { NextResponse } from 'next/server';
import { buildCollectionMetadata, getSiteUrl } from '@/lib/openseaMetadata';

export async function GET(request) {
  return NextResponse.json(
    buildCollectionMetadata({
      siteUrl: getSiteUrl(request),
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    }),
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    }
  );
}
