// — Chain-aware API helpers
// Shared server-side plumbing for routes that need to pick the right chain.

const { getChain, getSupportedChains, DEFAULT_CHAIN } = require('./chains');

const BASE_PRICE_DECIMALS = 1_000_000;
const BASE_OWNER_ABI_TEXT = ['function ownerOf(uint256 tokenId) view returns (address)'];
const BASE_PRICE_ABI_TEXT = ['function currentPrice() view returns (uint256)'];
const BASE_TRANSFER_ABI_TEXT = ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function normalizeChainId(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

function getRequestQueryChain(request) {
  try {
    if (request?.nextUrl?.searchParams) return request.nextUrl.searchParams.get('chain');
    if (request?.url) return new URL(request.url).searchParams.get('chain');
  } catch {
    return null;
  }
  return null;
}

function getRequestHeaderChain(request) {
  return request?.headers?.get?.('x-chain') || request?.headers?.get?.('x-tiles-chain') || null;
}

function resolveRequestedChainId(request = null, body = null) {
  return normalizeChainId(body?.chain)
    || normalizeChainId(getRequestQueryChain(request))
    || normalizeChainId(getRequestHeaderChain(request))
    || DEFAULT_CHAIN.id;
}

function assertSupportedChain(chainId) {
  return getChain(chainId);
}

function getBaseViemChain(chains) {
  const chainId = String(process.env.NEXT_PUBLIC_CHAIN_ID || '').trim();
  return chainId === '84532' ? chains.baseSepolia : chains.base;
}

async function createBasePublicClient(chainConfig) {
  const { createPublicClient, http } = await import('viem');
  const chains = await import('viem/chains');
  return createPublicClient({
    chain: getBaseViemChain(chains),
    transport: http(chainConfig.rpcUrl || undefined),
  });
}

async function getBaseCurrentPrice(chainConfig = getChain('base')) {
  const { parseAbi } = await import('viem');
  const publicClient = await createBasePublicClient(chainConfig);
  const raw = await publicClient.readContract({
    address: chainConfig.nftContract,
    abi: parseAbi(BASE_PRICE_ABI_TEXT),
    functionName: 'currentPrice',
  });
  return Number(raw) / BASE_PRICE_DECIMALS;
}

async function getBaseOwner(tileId, chainConfig = getChain('base')) {
  const { parseAbi } = await import('viem');
  const publicClient = await createBasePublicClient(chainConfig);
  return publicClient.readContract({
    address: chainConfig.nftContract,
    abi: parseAbi(BASE_OWNER_ABI_TEXT),
    functionName: 'ownerOf',
    args: [BigInt(tileId)],
  });
}

async function getChainCurrentPrice(chainId) {
  const chain = assertSupportedChain(chainId);
  if (chain.id === 'base') {
    return { currentPrice: await getBaseCurrentPrice(chain), source: 'on-chain' };
  }
  if (chain.id === 'casper') {
    const { createClient } = await import('./casper-client.js');
    const client = createClient({
      rpcUrl: chain.rpcUrl,
      contractHash: chain.nftContract,
      chainName: chain.chainName,
    });
    return { currentPrice: await client.getCurrentPrice(), source: 'on-chain' };
  }
  throw new Error(`Unsupported chain: ${chain.id}`);
}

async function getAllChainCurrentPrices(fallbackStats = {}) {
  const prices = {};
  for (const chain of getSupportedChains()) {
    try {
      prices[chain.id] = await getChainCurrentPrice(chain.id);
    } catch (err) {
      prices[chain.id] = {
        currentPrice: fallbackStats[chain.id]?.currentPrice ?? null,
        source: 'db-fallback',
        error: err?.message || String(err),
      };
    }
  }
  return prices;
}

function publicChainConfig(chainId, priceInfo = {}) {
  const chain = assertSupportedChain(chainId);
  const payload = {
    id: chain.id,
    name: chain.name,
    caip2: chain.caip2,
    chainName: chain.chainName,
    addressFormat: chain.addressFormat,
    nftContract: chain.nftContract,
    paymentToken: chain.paymentToken,
    treasury: chain.treasury,
    explorer: chain.explorer,
    x402Facilitator: chain.x402Facilitator,
    currentPrice: priceInfo.currentPrice ?? null,
    priceSource: priceInfo.source || null,
  };
  if (priceInfo.error) payload.priceError = priceInfo.error;
  return payload;
}

function buildChainStatsPayload(priceInfos = {}, dbStats = {}) {
  const payload = {};
  for (const chain of getSupportedChains()) {
    const stats = dbStats[chain.id] || { claimed: 0, totalRevenue: 0 };
    payload[chain.id] = {
      ...publicChainConfig(chain.id, priceInfos[chain.id] || {}),
      claimed: stats.claimed ?? 0,
      totalRevenue: stats.totalRevenue ?? 0,
    };
  }
  return payload;
}

async function verifyOwnershipOnChain(chainId, tileId, wallet) {
  const chain = assertSupportedChain(chainId);
  if (!wallet) throw new Error('wallet required');

  if (chain.id === 'base') {
    const onChainOwner = await getBaseOwner(tileId, chain);
    return {
      isOwner: onChainOwner.toLowerCase() === wallet.toLowerCase(),
      onChainOwner,
      canonicalOwner: onChainOwner.toLowerCase(),
    };
  }

  if (chain.id === 'casper') {
    const { createClient } = await import('./casper-client.js');
    const client = createClient({
      rpcUrl: chain.rpcUrl,
      contractHash: chain.nftContract,
      chainName: chain.chainName,
    });
    const isOwner = await client.verifyOwnership(tileId, wallet);
    return {
      isOwner,
      onChainOwner: isOwner ? wallet : null,
      canonicalOwner: wallet,
    };
  }

  throw new Error(`Unsupported chain: ${chain.id}`);
}

async function getBaseReceiptMintedTiles(chain, txHash) {
  const { decodeEventLog, parseAbi } = await import('viem');
  const publicClient = await createBasePublicClient(chain);
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error('Transaction reverted on-chain');
  }

  const transferAbi = parseAbi(BASE_TRANSFER_ABI_TEXT);
  const minted = new Set();
  for (const log of receipt.logs || []) {
    if (log.address?.toLowerCase() !== chain.nftContract.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'Transfer' && decoded.args.from === ZERO_ADDRESS) {
        minted.add(Number(decoded.args.tokenId));
      }
    } catch {
      // Not our Transfer event.
    }
  }
  return [...minted];
}

async function verifyBatchMintTransaction({ chainId, tileIds, wallet, txHash }) {
  const chain = assertSupportedChain(chainId);
  if (!txHash) throw new Error(chain.id === 'casper' ? 'deploy hash required' : 'txHash required');

  if (chain.id === 'base') {
    const mintedTileIds = await getBaseReceiptMintedTiles(chain, txHash);
    return { verifiedTileIds: mintedTileIds, txStatus: 'success' };
  }

  if (chain.id === 'casper') {
    const { createClient } = await import('./casper-client.js');
    const client = createClient({
      rpcUrl: chain.rpcUrl,
      contractHash: chain.nftContract,
      chainName: chain.chainName,
    });
    const deploy = await client.getDeployStatus(txHash);
    if (!deploy.executed || deploy.pending) throw new Error('Casper deploy is not finalized yet');
    if (!deploy.success) throw new Error(deploy.errorMessage || 'Casper deploy failed');

    const verifiedTileIds = [];
    for (const tileId of tileIds) {
      if (await client.verifyOwnership(tileId, wallet)) verifiedTileIds.push(tileId);
    }
    return { verifiedTileIds, txStatus: 'success' };
  }

  throw new Error(`Unsupported chain: ${chain.id}`);
}

module.exports = {
  resolveRequestedChainId,
  assertSupportedChain,
  publicChainConfig,
  buildChainStatsPayload,
  getChainCurrentPrice,
  getAllChainCurrentPrices,
  verifyOwnershipOnChain,
  verifyBatchMintTransaction,
  getBaseReceiptMintedTiles,
};
