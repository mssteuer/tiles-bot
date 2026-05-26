/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['sharp'],
  // styled-components requires the SWC compiler plugin for SSR
  compiler: {
    styledComponents: true,
  },
  // Transpile CSPR.click packages (they ship ESM/CJS that Next.js needs to process)
  transpilePackages: [
    '@make-software/csprclick-ui',
    '@make-software/csprclick-core-client',
    '@make-software/csprclick-core-types',
  ],
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
