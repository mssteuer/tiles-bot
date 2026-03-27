import { NextResponse } from 'next/server';
import { buildCollectionMetadata } from '@/lib/openseaMetadata';

function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'tiles.bot';
  return `${forwardedProto}://${forwardedHost}`;
}

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
