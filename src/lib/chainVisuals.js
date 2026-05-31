// — Chain UI helpers
// Client-safe display helpers for chain badges, grid borders, filtering, and explorer links.

const CHAIN_VISUALS = {
  base: {
    id: 'base',
    label: 'Base',
    borderColor: '#3b82f6',
    textClass: 'text-blue-400',
    dotClass: 'bg-blue-400',
  },
  casper: {
    id: 'casper',
    label: 'Casper',
    borderColor: '#ef4444',
    textClass: 'text-red-400',
    dotClass: 'bg-red-400',
  },
};

function normalizeChainId(chain) {
  if (!chain || typeof chain !== 'string') return null;
  const normalized = chain.trim().toLowerCase();
  return CHAIN_VISUALS[normalized] ? normalized : null;
}

function getTileChainId(tile) {
  if (!tile?.owner) return null;
  return normalizeChainId(tile.chain) || 'base';
}

function getChainVisual(tileOrChain) {
  const chainId = typeof tileOrChain === 'string' ? normalizeChainId(tileOrChain) : getTileChainId(tileOrChain);
  return CHAIN_VISUALS[chainId] || {
    id: null,
    label: 'Unclaimed',
    borderColor: null,
    textClass: 'text-text-muted',
    dotClass: 'bg-text-muted',
  };
}

function tileMatchesChainFilter(tile, chainFilter) {
  const normalized = normalizeChainId(chainFilter);
  if (!normalized) return true;
  return getTileChainId(tile) === normalized;
}

function joinUrl(base, path) {
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${path}`;
}

function formatAddressForChain(address, chainId) {
  if (!address) return '';
  if (chainId === 'casper' && address.startsWith('account-hash-') && address.length > 26) {
    return `${address.slice(0, 19)}...${address.slice(-6)}`;
  }
  if (address.length < 14) return address;
  if (chainId === 'casper') return `${address.slice(0, 6)}...${address.slice(-6)}`;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildChainExplorerLinks({ tile, chainConfig }) {
  const chainId = normalizeChainId(chainConfig?.id) || getTileChainId(tile) || 'base';
  const explorer = chainConfig?.explorer || (chainId === 'casper' ? 'https://cspr.live' : 'https://basescan.org');
  const contractAddress = tile?.chainContract || chainConfig?.nftContract || null;
  const owner = tile?.owner || null;
  const txHash = tile?.txHash || null;

  if (chainId === 'casper') {
    return {
      chainId,
      contractAddress,
      ownerUrl: owner ? joinUrl(explorer, `/account/${owner}`) : null,
      txUrl: txHash ? joinUrl(explorer, `/deploy/${txHash}`) : null,
      contractUrl: contractAddress ? joinUrl(explorer, `/contract-package/${contractAddress}`) : null,
      marketplaceUrl: null,
    };
  }

  return {
    chainId,
    contractAddress,
    ownerUrl: owner ? joinUrl(explorer, `/address/${owner}`) : null,
    txUrl: txHash ? joinUrl(explorer, `/tx/${txHash}`) : null,
    contractUrl: contractAddress ? joinUrl(explorer, `/address/${contractAddress}`) : null,
    marketplaceUrl: contractAddress && tile?.id != null
      ? `https://opensea.io/assets/base/${contractAddress}/${tile.id}`
      : null,
  };
}

module.exports = {
  CHAIN_VISUALS,
  getTileChainId,
  getChainVisual,
  tileMatchesChainFilter,
  buildChainExplorerLinks,
  formatAddressForChain,
};
