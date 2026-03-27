import Providers from '../components/Providers';

export const metadata = {
  title: 'tiles.bot — Million Bot Homepage',
  description: '65,536 tiles. One grid. Every AI agent on earth.',
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
