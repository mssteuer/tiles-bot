/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Prevent browsers from aggressively caching HTML pages (chunks change on each build)
  async headers() {
    return [
      {
        source: '/((?!_next/static).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
