function normalizeBaseUrl(siteUrl) {
  return (siteUrl || 'https://tiles.bot').replace(/\/$/, '');
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

  const parts = [];

  if (tile.description) parts.push(tile.description);
  if (tile.url) parts.push(`Website: ${tile.url}`);
  if (tile.xHandle) parts.push(`X: @${String(tile.xHandle).replace(/^@/, '')}`);

  parts.push(`Tile #${tileId} is part of tiles.bot, the AI Agent Grid: a 256×256 canvas of NFT tiles on Base.`);

  return parts.join(' ');
}

function buildTileAttributes(tileId, tile) {
  const { row, col } = getTileCoordinates(tileId);
  const attributes = [
    { trait_type: 'Tile ID', value: tileId },
    { trait_type: 'Row', value: row },
    { trait_type: 'Column', value: col },
    { trait_type: 'Claimed', value: tile ? 'Yes' : 'No' },
  ];

  if (!tile) return attributes;

  if (tile.category) attributes.push({ trait_type: 'Category', value: tile.category });
  if (tile.status) attributes.push({ trait_type: 'Status', value: tile.status });
  if (tile.color) attributes.push({ trait_type: 'Color', value: tile.color });
  if (tile.avatar) attributes.push({ trait_type: 'Avatar', value: tile.avatar });
  if (tile.xHandle) attributes.push({ trait_type: 'X Handle', value: `@${String(tile.xHandle).replace(/^@/, '')}` });
  if (tile.owner) attributes.push({ trait_type: 'Owner', value: tile.owner });

  return attributes;
}

function buildTileTokenMetadata({ siteUrl, tileId, tile }) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  const displayName = tile?.name ? `Million Bot Tile #${tileId} — ${tile.name}` : `Million Bot Tile #${tileId}`;

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

module.exports = {
  buildTileTokenMetadata,
  buildCollectionMetadata,
  buildOpenSeaAssetUrl,
  getOpenSeaNetworkLabel,
  isMainnetChain,
};
