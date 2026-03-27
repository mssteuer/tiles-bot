'use client';

import { buildOpenSeaAssetUrl, getOpenSeaNetworkLabel, isMainnetChain } from '../lib/openseaMetadata';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;

const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

export default function TilePanel({ tile, onClose }) {
  const isClaimed = !!tile.name;
  const row = Math.floor(tile.id / 256);
  const col = tile.id % 256;
  const hasContractAddress = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const openSeaUrl = hasContractAddress
    ? buildOpenSeaAssetUrl({ contractAddress: CONTRACT_ADDRESS, tileId: tile.id, chainId: CHAIN_ID })
    : null;
  const networkLabel = getOpenSeaNetworkLabel(CHAIN_ID);
  const isMainnet = isMainnetChain(CHAIN_ID);

  return (
    <div style={{
      width: 320,
      background: '#0f0f1a',
      borderLeft: '1px solid #1a1a2e',
      padding: 24,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* Close */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#555' }}>
          Tile #{tile.id} · ({col}, {row})
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer',
          lineHeight: 1,
        }}>×</button>
      </div>

      {isClaimed ? (
        <>
          {/* Agent card */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            textAlign: 'center',
            border: `1px solid ${tile.color || '#333'}33`,
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{tile.avatar || '🤖'}</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{tile.name}</h2>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 8, fontSize: 12, color: '#888',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: tile.status === 'online' ? '#22c55e' : tile.status === 'busy' ? '#f59e0b' : '#ef4444',
              }} />
              {tile.status || 'unknown'}
            </div>
          </div>

          {/* Category */}
          {tile.category && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `${CATEGORY_COLORS[tile.category] || '#333'}22`,
              border: `1px solid ${CATEGORY_COLORS[tile.category] || '#333'}44`,
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              color: CATEGORY_COLORS[tile.category] || '#888',
              alignSelf: 'flex-start',
            }}>
              {tile.category}
            </div>
          )}

          {/* Description */}
          {tile.description && (
            <p style={{ margin: 0, fontSize: 14, color: '#aaa', lineHeight: 1.6 }}>
              {tile.description}
            </p>
          )}

          {/* Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tile.url && (
              <a href={tile.url} target="_blank" rel="noopener" style={{
                color: '#3b82f6', fontSize: 13, textDecoration: 'none',
              }}>
                🔗 {tile.url}
              </a>
            )}
          </div>

          {/* Owner */}
          <div style={{ fontSize: 11, color: '#444', marginTop: 'auto' }}>
            Owner: {tile.owner ? `${tile.owner.slice(0, 6)}...${tile.owner.slice(-4)}` : 'demo'}
          </div>

          {/* Secondary market */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openSeaUrl && (
              <>
                <a
                  href={openSeaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#111122',
                    border: '1px solid #2563eb44',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#3b82f6',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1a1a2e'}
                  onMouseLeave={e => e.currentTarget.style.background = '#111122'}
                >
                  View on OpenSea
                </a>
                <a
                  href={openSeaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#1a1a2e',
                    border: '1px solid #33384f',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  List for Sale
                </a>
              </>
            )}

            <div style={{
              background: '#111122',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: '#666',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {isMainnet
                ? 'Secondary market is live on OpenSea.'
                : `OpenSea links are visible on ${networkLabel} too. Note: testnet listings are for preview/testing only.`}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Unclaimed tile */}
          <div style={{
            background: '#1a1a2e',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            border: '1px dashed #333',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📍</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#555' }}>Unclaimed</h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#444' }}>
              Position ({col}, {row})
            </p>
          </div>

          <button style={{
            width: '100%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            border: 'none',
            color: '#fff',
            padding: '14px 0',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
          }}>
            Claim This Tile — $1.00
          </button>

          <p style={{ fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 1.6 }}>
            Pay with USDC on Base via x402.<br />
            No signup required. Just a wallet.
          </p>
        </>
      )}
    </div>
  );
}
