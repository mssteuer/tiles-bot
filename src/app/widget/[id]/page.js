/**
 * /widget/[id] — Embeddable tile widget
 *
 * A compact, self-contained tile card designed for iframe embedding.
 * Renders the agent's avatar, name, status indicator, and category.
 * No external JS dependencies — pure HTML/CSS served by Next.js.
 *
 * Usage: <iframe src="https://tiles.bot/widget/42" width="256" height="128" frameborder="0" />
 */

import { getTile } from '@/lib/db';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://tiles.bot';

const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

export const revalidate = 60; // ISR — revalidate every 60 seconds

export async function generateMetadata({ params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);
  const tile = (!isNaN(tileId) && tileId >= 0 && tileId < 65536) ? getTile(tileId) : null;
  const name = tile?.name || `Tile #${id}`;
  return {
    title: `${name} — tiles.bot widget`,
    robots: 'noindex',
  };
}

export default async function WidgetPage({ params }) {
  const { id } = await params;
  const tileId = parseInt(id, 10);

  const isValidId = Number.isInteger(tileId) && tileId >= 0 && tileId < 65536;
  const tile = isValidId ? getTile(tileId) : null;

  if (!isValidId) {
    return (
      <html>
        <body className="m-0 flex h-screen items-center justify-center bg-[#0f172a]">
          <div className="font-[system-ui,sans-serif] text-[13px] text-[#64748b]">Invalid tile ID</div>
        </body>
      </html>
    );
  }

  const isClaimed = tile && tile.owner;
  const name = tile?.name || `Tile #${tileId}`;
  const avatar = tile?.avatar || '🤖';
  const category = tile?.category || null;
  const status = tile?.status || 'offline';
  const color = tile?.color || CATEGORY_COLORS[category] || '#3b82f6';
  const catColor = CATEGORY_COLORS[category] || '#6b7280';
  const imageUrl = tile?.imageUrl || null;
  const isOnline = status === 'online';
  const row = Math.floor(tileId / 256);
  const col = tileId % 256;
  const tileUrl = `${siteUrl}/tiles/${tileId}`;

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{name} — tiles.bot</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
          }
          .widget {
            width: 256px;
            height: 128px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border: 1px solid ${color}33;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            position: relative;
            cursor: pointer;
            text-decoration: none;
            transition: border-color 0.2s ease;
            overflow: hidden;
          }
          .widget::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, ${color}88, transparent);
          }
          .widget:hover { border-color: ${color}66; }
          .avatar-wrap {
            position: relative;
            flex-shrink: 0;
          }
          .avatar-img {
            width: 56px;
            height: 56px;
            border-radius: 10px;
            object-fit: cover;
            border: 1px solid ${color}44;
          }
          .avatar-emoji {
            width: 56px;
            height: 56px;
            border-radius: 10px;
            background: ${color}22;
            border: 1px solid ${color}44;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            line-height: 1;
          }
          .status-dot {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid #0f172a;
            background: ${isOnline ? '#22c55e' : '#475569'};
            ${isOnline ? `box-shadow: 0 0 6px #22c55e88;` : ''}
          }
          .info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .name {
            color: #f1f5f9;
            font-size: 14px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .meta {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
          .cat-badge {
            background: ${catColor}22;
            border: 1px solid ${catColor}44;
            color: ${catColor};
            font-size: 10px;
            font-weight: 500;
            padding: 2px 6px;
            border-radius: 4px;
            text-transform: capitalize;
            white-space: nowrap;
          }
          .status-label {
            font-size: 10px;
            color: ${isOnline ? '#22c55e' : '#64748b'};
            font-weight: 500;
          }
          .tile-ref {
            font-size: 10px;
            color: #475569;
            margin-top: 2px;
          }
          .watermark {
            position: absolute;
            bottom: 8px;
            right: 10px;
            font-size: 9px;
            color: #334155;
            font-weight: 500;
            letter-spacing: 0.02em;
          }
          .unclaimed-state {
            width: 256px;
            height: 128px;
            background: #1e293b;
            border: 1px dashed #334155;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            text-decoration: none;
            cursor: pointer;
          }
          .unclaimed-icon { font-size: 24px; }
          .unclaimed-text { color: #64748b; font-size: 12px; }
          .unclaimed-sub { color: #334155; font-size: 10px; }
        `}</style>
      </head>
      <body>
        {isClaimed ? (
          <a href={tileUrl} target="_blank" rel="noopener noreferrer" className="widget flex">
            <div className="avatar-wrap">
              {imageUrl ? (
                <img src={imageUrl} alt={name} className="avatar-img" />
              ) : (
                <div className="avatar-emoji">{avatar}</div>
              )}
              <div className="status-dot" title={isOnline ? 'Online' : 'Offline'} />
            </div>
            <div className="info">
              <div className="name">{name}</div>
              <div className="meta">
                {category && <span className="cat-badge">{category}</span>}
                <span className="status-label">{isOnline ? '● Online' : '○ Offline'}</span>
              </div>
              <div className="tile-ref">Tile #{tileId} ({col}, {row})</div>
            </div>
            <div className="watermark">tiles.bot</div>
          </a>
        ) : (
          <a href={tileUrl} target="_blank" rel="noopener noreferrer" className="unclaimed-state flex">
            <div className="unclaimed-icon">◇</div>
            <div className="unclaimed-text">Tile #{tileId} — Available</div>
            <div className="unclaimed-sub">Claim on tiles.bot</div>
          </a>
        )}
      </body>
    </html>
  );
}
