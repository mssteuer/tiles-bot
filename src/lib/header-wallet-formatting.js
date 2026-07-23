function formatChainPrice(value, chain) {
  // null/NaN means the chain price isn't live yet (e.g. Casper contract unconfigured,
  // /api/stats returns currentPrice=null). Render an explicit "not live" dash rather
  // than a loading-style ellipsis that would otherwise hang forever.
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (chain === 'casper') {
    if (n >= 1000) return `${Math.round(n).toLocaleString()} CSPR`;
    if (n >= 1) return `${n.toFixed(2)} CSPR`;
    return `${n.toFixed(4)} CSPR`;
  }
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

function buildWalletExplorerUrl(chainsPayload, activeChain, address) {
  if (!chainsPayload || !activeChain || !address) return null;
  const chain = chainsPayload.chains?.[activeChain];
  if (!chain?.explorer || !chain?.explorerAddressPattern) return null;
  return `${chain.explorer}${chain.explorerAddressPattern}${address}`;
}

function getWalletExplorerLabel(activeChain) {
  if (activeChain === 'casper') return 'cspr.live';
  if (activeChain === 'base') return 'BaseScan';
  return 'block explorer';
}

module.exports = {
  formatChainPrice,
  buildWalletExplorerUrl,
  getWalletExplorerLabel,
};
