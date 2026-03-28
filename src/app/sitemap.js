import { getClaimedTileIds } from '@/lib/db';

const BASE_URL = 'https://tiles.bot';

export default function sitemap() {
  // Static pages
  const staticPages = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Claimed tile pages (individual agent pages worth indexing)
  let tilePages = [];
  try {
    const tileIds = getClaimedTileIds();
    tilePages = tileIds.map((id) => ({
      url: `${BASE_URL}/tiles/${id}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    }));
  } catch {
    // DB not available during build — return static pages only
  }

  return [...staticPages, ...tilePages];
}
