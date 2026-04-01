/**
 * GET /widget/[id]/embed-code
 *
 * Returns a JSON response with the iframe embed code and a plain HTML snippet
 * that tile owners can paste into their websites to showcase their tile.
 */

import { NextResponse } from 'next/server';
import { getTile, TOTAL_TILES } from '@/lib/db';
import { getSiteUrl } from '@/lib/openseaMetadata';

export async function GET(request, { params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  if (isNaN(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
    return NextResponse.json({ error: 'Invalid tile ID' }, { status: 400 });
  }

  const tile = getTile(tileId);
  const siteUrl = getSiteUrl(request);
  const widgetUrl = `${siteUrl}/widget/${tileId}`;
  const tileUrl = `${siteUrl}/tiles/${tileId}`;
  const name = tile?.name || `Tile #${tileId}`;

  const iframeHtml = `<iframe src="${widgetUrl}" width="256" height="128" frameborder="0" scrolling="no" style="border-radius:12px;overflow:hidden;" title="${name} on tiles.bot" loading="lazy"></iframe>`;

  const markdownBadge = `[![${name} on tiles.bot](${widgetUrl})](${tileUrl})`;

  return NextResponse.json({
    tileId,
    name,
    widgetUrl,
    tileUrl,
    iframe: iframeHtml,
    markdown: markdownBadge,
    dimensions: { width: 256, height: 128 },
  });
}
