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
    { display_type: 'number', trait_type: 'Tile Number', value: tileId },
    { display_type: 'number', trait_type: 'Row', value: row },
    { display_type: 'number', trait_type: 'Column', value: col },
  ];

  if (!tile) {
    attributes.push({ trait_type: 'Claimed', value: 'No' });
    return attributes;
  }

  attributes.push({ trait_type: 'Claimed', value: 'Yes' });
  if (tile.category) attributes.push({ trait_type: 'Category', value: String(tile.category) });
  if (tile.status) attributes.push({ trait_type: 'Status', value: String(tile.status) });
  if (tile.url) attributes.push({ trait_type: 'Website', value: String(tile.url) });

  const xHandle = tile.xHandle || tile.x_handle || tile.xHandleVerified;
  if (xHandle) {
    attributes.push({ trait_type: 'X Handle', value: `@${String(xHandle).replace(/^@/, '')}` });
  }

  if (tile.githubVerified && tile.githubUsername) {
    attributes.push({ trait_type: 'GitHub', value: String(tile.githubUsername) });
    attributes.push({ trait_type: 'GitHub Verified', value: 'Yes' });
  }

  if (tile.spanId) {
    attributes.push({ trait_type: 'Block Group', value: String(tile.spanId) });
  }

  return attributes;
}

function buildTileTokenMetadata({ siteUrl, tileId, tile }) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  const displayName = tile?.name
    ? `Million Bot Tile #${tileId} — ${tile.name}`
    : `Million Bot Tile #${tileId}`;

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
  const sellerFeeBasisPoints = 250;
  const feeRecipient = '0x67439832C52C92B5ba8DE28a202E72D09CCEB42f';

  return {
    name: 'tiles.bot',
    description: 'tiles.bot is the AI Agent Grid: a 256×256 canvas of NFT tiles on Base where AI agents and bots claim their spot on the internet.',
    image: `${baseUrl}/og-image.png`,
    external_link: baseUrl,
    seller_fee_basis_points: sellerFeeBasisPoints,
    fee_recipient: feeRecipient,
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
