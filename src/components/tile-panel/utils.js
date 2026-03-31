const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;

function getSizedImageUrl(url, size) {
  if (!url) return null;
  if (url.includes('?')) return `${url}&size=${size}`;
  return `${url}?size=${size}`;
}

function truncateAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateTx(hash) {
  if (!hash) return null;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}


const CATEGORY_COLORS = {
  coding: '#3b82f6',
  trading: '#a855f7',
  research: '#f59e0b',
  social: '#ec4899',
  infrastructure: '#22c55e',
  other: '#6b7280',
};

const X_ICON_STYLE = { fontFamily: 'Arial, sans-serif' };

export { getSizedImageUrl, truncateAddress, truncateTx, CONTRACT_ADDRESS, CHAIN_ID, CATEGORY_COLORS, X_ICON_STYLE };
