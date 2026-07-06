// — Chain Abstraction Layer
// Centralized registry: structural metadata + env-var-loaded deployment config.
// All chain-specific lookups go through this module.

const CHAIN_DEFINITIONS = [
  {
    id: 'base',
    caip2: 'eip155:8453',
    name: 'Base',
    addressFormat: 'evm',
    explorerTxPattern: '/tx/',
    explorerAddressPattern: '/address/',
    marketplace: (contract, tokenId) => `https://opensea.io/assets/base/${contract}/${tokenId}`
  },
  {
    id: 'casper',
    caip2: 'casper:casper',
    name: 'Casper',
    addressFormat: 'casper',
    explorerTxPattern: '/deploy/',
    explorerAddressPattern: '/account/',
    marketplace: null
  }
];

const ENV_FIELDS = ['NFT_CONTRACT', 'PAYMENT_TOKEN', 'TREASURY', 'RPC_URL', 'EXPLORER', 'X402_FACILITATOR'];
const defaultChainId = process.env.DEFAULT_CHAIN || 'base';

function getOptionalChainEnv(chainId, field) {
  return process.env[`CHAIN_${chainId.toUpperCase()}_${field}`] || '';
}

function getFallbackChainEnv(chainId, field) {
  if (chainId !== 'base' || !process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) return '';
  const fallbackMap = {
    NFT_CONTRACT: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    PAYMENT_TOKEN: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    TREASURY: process.env.X402_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000',
    RPC_URL: process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
    EXPLORER: process.env.BASE_EXPLORER_URL || 'https://basescan.org',
    X402_FACILITATOR: process.env.X402_FACILITATOR_URL || 'https://facilitator.x402.org',
  };
  return fallbackMap[field] || '';
}

function chainNameFor(definition) {
  return definition.caip2?.split(':')[1] || definition.id;
}

function loadChainEnv(chainId) {
  const prefix = `CHAIN_${chainId.toUpperCase()}_`;
  const env = {};
  for (const field of ENV_FIELDS) {
    const varName = `${prefix}${field}`;
    const value = process.env[varName] || getFallbackChainEnv(chainId, field);
    if (!value) {
      // During Next.js build, env vars may not be available. Non-default chains can
      // also be partially configured at runtime; callers surface price/config errors
      // for those chains instead of crashing unrelated Base endpoints.
      if (process.env.NEXT_PHASE === 'phase-production-build' || chainId !== defaultChainId) {
        env[field] = '';
        continue;
      }
      throw new Error(`Missing env var: ${varName}`);
    }
    env[field] = value;
  }
  return env;
}

function buildChainConfig(definition) {
  const env = loadChainEnv(definition.id);
  return {
    id: definition.id,
    caip2: definition.caip2,
    chainName: getOptionalChainEnv(definition.id, 'CHAIN_NAME') || chainNameFor(definition),
    wcsprDomainVersion: getOptionalChainEnv(definition.id, 'WCSPR_DOMAIN_VERSION') || '1',
    name: definition.name,
    addressFormat: definition.addressFormat,
    nftContract: env.NFT_CONTRACT,
    paymentToken: env.PAYMENT_TOKEN,
    treasury: env.TREASURY,
    rpcUrl: env.RPC_URL,
    explorer: env.EXPLORER,
    x402Facilitator: env.X402_FACILITATOR,
    explorerTx: (hash) => `${env.EXPLORER}${definition.explorerTxPattern}${hash}`,
    explorerAddressPattern: definition.explorerAddressPattern,
    explorerAddress: (address) => `${env.EXPLORER}${definition.explorerAddressPattern}${address}`,
    marketplace: definition.marketplace
  };
}

// — Build registry on import (fail-fast validation)
const registry = new Map();
for (const def of CHAIN_DEFINITIONS) {
  registry.set(def.id, buildChainConfig(def));
}

// — Resolve default chain
if (!registry.has(defaultChainId)) {
  throw new Error(`DEFAULT_CHAIN "${defaultChainId}" is not a registered chain`);
}

// — Address format detection
const ADDRESS_PATTERNS = [
  { format: 'evm', regex: /^0x[0-9a-fA-F]{40}$/ },
  { format: 'casper', regex: /^(01|02)[0-9a-fA-F]{64}$/ }
];

function getChain(id) {
  const chain = registry.get(id);
  if (!chain) {
    throw new Error(`Unknown chain: ${id}`);
  }
  return chain;
}

function getChainByAddress(address) {
  for (const { format, regex } of ADDRESS_PATTERNS) {
    if (regex.test(address)) {
      const match = [...registry.values()].find(c => c.addressFormat === format);
      if (match) return match;
    }
  }
  throw new Error(`Unrecognized address format: ${address}`);
}

function getSupportedChains() {
  return [...registry.values()];
}

module.exports = {
  getChain,
  getChainByAddress,
  getSupportedChains,
  DEFAULT_CHAIN: registry.get(defaultChainId)
};
