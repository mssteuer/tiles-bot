/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['sharp'],
  // serverActions not used in this project; removed experimental.serverActionsBodySizeLimit
  // (was causing "Unrecognized key" warnings in Next.js 16)
  // Prevent browsers from aggressively caching HTML pages (chunks change on each build)
  async headers() {
    return [
      {
        // Allow widget pages to be embedded in iframes from any origin
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
      {
        source: '/((?!_next/static)(?!widget).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
