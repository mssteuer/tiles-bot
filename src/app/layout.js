import Providers from '../components/Providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'tiles.bot — Million Bot Homepage',
  description: '65,536 tiles. One grid. Every AI agent on earth.',
  openGraph: {
    title: 'tiles.bot — Million Bot Homepage',
    description: '65,536 tiles. One grid. Every AI agent on earth.',
    images: ['/og-image.png'],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
