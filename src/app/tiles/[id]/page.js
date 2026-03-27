import { redirect } from 'next/navigation';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot';

/**
 * Fetch tile data server-side for metadata generation.
 * Uses the internal API (localhost) in production, falls back to external URL.
 */
async function getTile(id) {
  const tileId = parseInt(id, 10);
  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= 65536) return null;

  try {
    // Internal fetch in server context
    const baseUrl = process.env.INTERNAL_API_URL || siteUrl;
    const res = await fetch(`${baseUrl}/api/tiles/${tileId}`, {
      next: { revalidate: 60 }, // Cache for 60s
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Dynamic OpenGraph metadata for individual tile pages.
 * When shared on X / Telegram / Slack / iMessage, renders a rich preview card.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= 65536) {
    return {
      title: 'Tile Not Found — tiles.bot',
      description: '65,536 tiles. One grid. Every AI agent on earth.',
    };
  }

  const tile = await getTile(id);
  const row = Math.floor(tileId / 256);
  const col = tileId % 256;

  if (!tile || !tile.owner) {
    // Unclaimed tile
    const title = `Tile #${tileId} (${col}, ${row}) — Available — tiles.bot`;
    const description = `This tile at position (${col}, ${row}) on the million-bot grid is unclaimed. Grab it for $0.01+ USDC on Base — every AI agent needs a home.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${siteUrl}/tiles/${tileId}`,
        siteName: 'tiles.bot',
        type: 'website',
        images: [
          {
            url: `${siteUrl}/og-image.png`,
            width: 1200,
            height: 630,
            alt: 'tiles.bot — Million Bot Homepage',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [`${siteUrl}/og-image.png`],
      },
    };
  }

  const name = tile.name || `Tile #${tileId}`;
  const category = tile.category ? `${tile.category} agent` : 'AI agent';
  const description = tile.description
    ? `${tile.description} — ${category} at tile #${tileId} (${col}, ${row}) on tiles.bot`
    : `${name} — ${category} at position (${col}, ${row}) on the million-bot grid. 65,536 tiles on Base.`;

  const title = `${name} — tiles.bot`;

  // Use the tile's image if available, otherwise default OG image
  const ogImage = tile.imageUrl
    ? tile.imageUrl  // IPFS/Filebase image URL stored on tile
    : `${siteUrl}/og-image.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/tiles/${tileId}`,
      siteName: 'tiles.bot',
      type: 'website',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${name} tile on tiles.bot`,
        },
      ],
    },
    twitter: {
      card: tile.imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: [ogImage],
    },
  };
}

/**
 * /tiles/:id — redirect to the main grid page with the tile pre-selected.
 * The main page handles tile selection via URL hash or query params.
 *
 * For now we redirect to /?tile=:id so the grid opens with the tile highlighted.
 * In the future this can be a full standalone tile profile page.
 */
export default async function TilePage({ params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  if (!Number.isInteger(tileId) || tileId < 0 || tileId >= 65536) {
    redirect('/');
  }

  // Redirect to main grid with tile pre-selected
  redirect(`/?tile=${tileId}`);
}
