function normalizeBaseUrl(siteUrl) {
  return (siteUrl || 'https://tiles.bot').replace(/\/$/, '');
}

function getSiteUrl(request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return normalizeBaseUrl(configured);

  const forwardedProto = request?.headers?.get('x-forwarded-proto') || 'https';
  const forwardedHost = request?.headers?.get('x-forwarded-host') || request?.headers?.get('host') || 'tiles.bot';
  return `${forwardedProto}://${forwardedHost}`;
}

function resolveImageUrl(siteUrl, imageUrl) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  if (!imageUrl) return `${baseUrl}/og-image.png`;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

function getTileCoordinates(tileId) {
  return {
    row: Math.floor(tileId / 256),
    col: tileId % 256,
  };
}

function buildTileDescription(tileId, tile) {
  if (!tile) {
    return `Tile #${tileId} on tiles.bot, the AI Agent Grid: a 256×256 canvas of NFT tiles on Base.`;
  }

  // Use the tile's "About" field as the NFT description
  if (tile.description) return tile.description;

  // Fallback if no description set
  const name = tile.name || `Tile #${tileId}`;
  return `${name} on tiles.bot, the AI Agent Grid: a 256×256 canvas of NFT tiles on Base.`;
}

function buildTileAttributes(tileId, tile) {
  const { row, col } = getTileCoordinates(tileId);
  const attributes = [
    { trait_type: 'Tile Number', value: tileId },
    { trait_type: 'X Coordinate', value: col },
    { trait_type: 'Y Coordinate', value: row },
  ];

  if (!tile) return attributes;

  if (tile.category) attributes.push({ trait_type: 'Category', value: tile.category });
  if (tile.url) attributes.push({ trait_type: 'Website', value: tile.url });

  // Verified X account
  if (tile.xVerified && tile.xHandleVerified) {
    attributes.push({ trait_type: 'X Account', value: `@${String(tile.xHandleVerified).replace(/^@/, '')}` });
    attributes.push({ trait_type: 'X Verified', value: 'Yes' });
  } else if (tile.xHandle) {
    attributes.push({ trait_type: 'X Account', value: `@${String(tile.xHandle).replace(/^@/, '')}` });
    attributes.push({ trait_type: 'X Verified', value: 'No' });
  }

  // Verified GitHub account
  if (tile.githubVerified && tile.githubUsername) {
    attributes.push({ trait_type: 'GitHub', value: tile.githubUsername });
    attributes.push({ trait_type: 'GitHub Verified', value: 'Yes' });
  }

  return attributes;
}

function buildTileTokenMetadata({ siteUrl, tileId, tile }) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  const displayName = tile?.name || `Tile #${tileId}`;

  return {
    name: displayName,
    description: buildTileDescription(tileId, tile),
    image: resolveImageUrl(baseUrl, tile?.imageUrl),
    external_url: `${baseUrl}/?tile=${tileId}`,
    attributes: buildTileAttributes(tileId, tile),
  };
}

function buildCollectionMetadata({ siteUrl }) {
  const baseUrl = normalizeBaseUrl(siteUrl);

  return {
    name: 'tiles.bot',
    description: 'tiles.bot is the AI Agent Grid: a 256×256 canvas of NFT tiles on Base where AI agents and bots claim their spot on the internet.',
    image: `${baseUrl}/og-image.png`,
    external_link: baseUrl,
    seller_fee_basis_points: 0,
    fee_recipient: '0x0000000000000000000000000000000000000000',
  };
}

function isMainnetChain(chainId) {
  return String(chainId || '') === '8453';
}

function getOpenSeaNetworkLabel(chainId) {
  return isMainnetChain(chainId) ? 'Base' : 'Base Sepolia';
}

function buildOpenSeaAssetUrl({ contractAddress, tileId, chainId }) {
  if (!contractAddress) return null;
  const networkPath = isMainnetChain(chainId) ? 'base' : 'base_sepolia';
  const host = isMainnetChain(chainId) ? 'https://opensea.io' : 'https://testnets.opensea.io';
  return `${host}/assets/${networkPath}/${contractAddress}/${tileId}`;
}

function buildOpenSeaSellUrl({ contractAddress, tileId, chainId }) {
  const assetUrl = buildOpenSeaAssetUrl({ contractAddress, tileId, chainId });
  return assetUrl ? `${assetUrl}/sell` : null;
}

module.exports = {
  buildTileTokenMetadata,
  buildCollectionMetadata,
  buildOpenSeaAssetUrl,
  buildOpenSeaSellUrl,
  getOpenSeaNetworkLabel,
  getSiteUrl,
  isMainnetChain,
};
