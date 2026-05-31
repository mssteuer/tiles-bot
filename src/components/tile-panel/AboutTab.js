'use client';

import { useState, useEffect } from 'react';
import ShareButton from './ShareButton';
import { VerificationBadge } from './VerificationBadge';
import { getSizedImageUrl, truncateTx, CATEGORY_COLORS, X_ICON_STYLE } from './utils';
const {
  getTileChainId,
  getChainVisual,
  buildChainExplorerLinks,
  formatAddressForChain,
} = require('@/lib/chainVisuals');

function EmbedCodeButton({ tileId }) {
  const [copied, setCopied] = useState(false);
  const [embedCode, setEmbedCode] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    if (embedCode) {
      navigator.clipboard.writeText(embedCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/widget/${tileId}/embed-code`);
      const data = await res.json();
      setEmbedCode(data.embedCode);
      navigator.clipboard.writeText(data.embedCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} className="btn-retro w-full px-3 py-2 text-[12px] text-text-dim">
      {copied ? '✓ Copied!' : loading ? 'Loading…' : '📋 Copy Embed Code'}
      {embedCode && (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded border border-border-dim bg-surface-dark p-2 text-left text-[10px] text-text-gray">
          {embedCode}
        </pre>
      )}
    </button>
  );
}

function withAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return null;
  const normalized = hex.startsWith('#') ? hex : `#${hex}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return `${normalized}${alpha}`;
}

export default function AboutTab({ tile, isOwner }) {
  const [viewStats, setViewStats] = useState(null);
  const [repBreakdown, setRepBreakdown] = useState(null);
  const [chainConfigs, setChainConfigs] = useState({});

  const tileStatusClass = tile.status === 'online' ? 'bg-accent-green' : tile.status === 'busy' ? 'bg-accent-amber' : 'bg-accent-red';
  const categoryColor = CATEGORY_COLORS[tile.category] || '#333';
  const tileCardStyle = { background: '#1a1a2e', borderColor: withAlpha(tile.color || '#333333', '33') || '#33333333' };
  const categoryStyle = { background: withAlpha(categoryColor, '22') || 'transparent', borderColor: withAlpha(categoryColor, '44') || 'transparent', color: categoryColor };
  const chainId = getTileChainId(tile) || 'base';
  const chainVisual = getChainVisual(tile);
  const chainConfig = chainConfigs[chainId] || { id: chainId, explorer: chainId === 'casper' ? 'https://cspr.live' : 'https://basescan.org', nftContract: tile.chainContract };
  const chainLinks = buildChainExplorerLinks({ tile, chainConfig });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/chains')
      .then(r => r.json())
      .then(d => { if (!cancelled && d.chains) setChainConfigs(d.chains); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tile.id == null) return;
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/views`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.totalViews != null) setViewStats({ totalViews: d.totalViews, todayViews: d.todayViews }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tile.id]);

  useEffect(() => {
    if (tile.id == null) return;
    let cancelled = false;
    fetch(`/api/tiles/${tile.id}/rep`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.breakdown) setRepBreakdown(d.breakdown); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tile.id]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[12px] border px-5 py-5 text-center" style={tileCardStyle}>
        {tile.imageUrl ? (
          <img
            src={getSizedImageUrl(tile.imageUrl, 256)}
            alt={tile.name || 'Tile image'}
            className="mx-auto mb-3 block aspect-square w-full max-w-64 rounded-[16px] border border-border-bright object-cover"
          />
        ) : (
          <div className="mb-2 text-[48px]">{tile.avatar || '🤖'}</div>
        )}
        <h2 className="m-0 text-[18px] font-bold">{tile.name}</h2>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-slate-400">
          <span className={`h-2 w-2 rounded-full ${tileStatusClass}`} />
          {tile.status || 'unknown'}
        </div>
      </div>

      {tile.category && (
        <div
          className="inline-flex w-fit items-center gap-1.5 rounded-[20px] border px-3 py-1 text-[12px]"
          style={categoryStyle}
        >
          {tile.category}
        </div>
      )}

      {tile.description && (
        <p className="m-0 text-[14px] leading-[1.6] text-slate-300">{tile.description}</p>
      )}

      <div className="flex flex-col gap-2">
        {tile.url && (
          <a href={tile.url} target="_blank" rel="noopener" className="text-[13px] text-accent-blue no-underline">
            🔗 {tile.url}
          </a>
        )}
        {(tile.xHandle || (tile.xVerified && tile.xHandleVerified)) && (
          <a
            href={`https://x.com/${tile.xHandleVerified || tile.xHandle}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1 text-[13px] text-text-dim no-underline"
          >
            <span style={X_ICON_STYLE}>𝕏</span> @{tile.xHandleVerified || tile.xHandle}
            <VerificationBadge verified={tile.xVerified} title={tile.xVerified ? 'X/Twitter identity verified' : 'X/Twitter identity not verified'} />
          </a>
        )}
        {(tile.githubUsername || isOwner) && (
          tile.githubUsername ? (
            <a
              href={`https://github.com/${tile.githubUsername}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1 text-[13px] text-text-dim no-underline"
            >
              <span>🐙 @{tile.githubUsername}</span>
              <VerificationBadge verified={tile.githubVerified} title={tile.githubVerified ? 'GitHub identity verified' : 'GitHub identity not verified'} />
            </a>
          ) : (
            <div className="flex items-center gap-1 text-[13px] text-text-dim">
              <span>🐙 GitHub</span>
              <VerificationBadge verified={false} title="GitHub identity not verified" />
            </div>
          )
        )}
      </div>

      <div className="flex flex-col gap-1 text-[11px] text-text-gray">
        {tile.repScore != null && (
          <div className="flex items-center gap-1.5">
            <span>
              {tile.repScore >= 80 ? '⭐' : tile.repScore >= 50 ? '✨' : tile.repScore >= 20 ? '🔹' : '🌱'}
            </span>
            <span
              title={
                repBreakdown
                  ? [
                      `Reputation score: ${tile.repScore}/100`,
                      `Heartbeat freshness: ${repBreakdown.heartbeat ?? 0} pts`,
                      `Connections: ${repBreakdown.connections ?? 0} pts`,
                      `Notes received: ${repBreakdown.notes ?? 0} pts`,
                      `Actions & emotes: ${repBreakdown.actions ?? 0} pts`,
                      `Age bonus: ${repBreakdown.age ?? 0} pts`,
                      `Verified identity: ${repBreakdown.identity ?? 0} pts`,
                      `Profile completeness: ${repBreakdown.profile ?? 0} pts`,
                    ].join('\n')
                  : tile.repScore === 0
                    ? 'New agent — earn rep through heartbeats, notes, and connections'
                    : 'Reputation score (0–100)'
              }
            >
              Rep {tile.repScore}/100
            </span>
          </div>
        )}
        {viewStats != null && viewStats.totalViews > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-dim">👁</span>
            <span>{viewStats.totalViews.toLocaleString()} view{viewStats.totalViews !== 1 ? 's' : ''}</span>
            {viewStats.todayViews > 0 && (
              <span className="text-text-dim">(+{viewStats.todayViews} today)</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-text-dim">Chain:</span>
          <span className={`inline-flex items-center gap-1 font-semibold ${chainVisual.textClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {chainVisual.label}
          </span>
        </div>
        {chainLinks.contractAddress && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-dim">Contract:</span>
            {chainLinks.contractUrl ? (
              <a href={chainLinks.contractUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-accent-blue no-underline">
                {formatAddressForChain(chainLinks.contractAddress, chainId)}
              </a>
            ) : (
              <span className="font-mono text-text-dim">{formatAddressForChain(chainLinks.contractAddress, chainId)}</span>
            )}
          </div>
        )}
        {tile.owner ? (
          <div className="flex items-center gap-1.5">
            <span className="text-text-dim">Owner:</span>
            <a href={chainLinks.ownerUrl || '#'} target="_blank" rel="noopener noreferrer" className="font-mono text-accent-blue no-underline">
              {formatAddressForChain(tile.owner, chainId)}
            </a>
            {chainId === 'base' && (
              <a href={`https://opensea.io/${tile.owner}`} target="_blank" rel="noopener noreferrer" title="View owner on OpenSea" className="text-[10px] text-text-dim no-underline">
                OS
              </a>
            )}
          </div>
        ) : (
          <span className="text-text-dim">Owner: demo</span>
        )}
        {tile.txHash ? (
          <div className="flex items-center gap-1.5">
            <span className="text-text-dim">Tx:</span>
            <a href={chainLinks.txUrl || '#'} target="_blank" rel="noopener noreferrer" className="font-mono text-accent-blue no-underline">
              {truncateTx(tile.txHash)}
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-text-dim">Tx:</span>
            <span className="text-text-dim">—</span>
          </div>
        )}
      </div>

      {tile.imageUrl && (
        <a
          href={getSizedImageUrl(tile.imageUrl, 512)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-bright bg-surface-2 px-3 py-2 text-[13px] font-medium text-text no-underline"
        >
          🖼️ Open full-resolution image
        </a>
      )}

      {chainLinks.marketplaceUrl ? (
        <div>
          <a
            href={chainLinks.marketplaceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-retro flex w-full items-center justify-center gap-2 text-[13px] no-underline ${isOwner ? 'border-accent-purple/30 text-accent-purple' : 'border-accent-blue/30 text-accent-blue'}`}
          >
            {isOwner ? '💰 List for Sale on OpenSea' : '◇ View on OpenSea'}
          </a>
        </div>
      ) : chainId === 'casper' ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-center text-[12px] text-red-300">
          Casper tiles trade directly on the grid — no external marketplace yet.
        </div>
      ) : null}

      <ShareButton tileId={tile.id} />
      {isOwner && <EmbedCodeButton tileId={tile.id} />}
    </div>
  );
}
