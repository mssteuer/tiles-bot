// — Base x402 Settlement Config

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function normalizeAddress(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isZeroAddress(address) {
  return address.toLowerCase() === ZERO_ADDRESS;
}

function isValidEvmAddress(address) {
  return EVM_ADDRESS_RE.test(address);
}

function isNextProductionBuild(env) {
  return env.NEXT_PHASE === 'phase-production-build';
}

function inferBaseX402Network(chainConfig = {}) {
  if (chainConfig.caip2 === 'eip155:84532') return 'base-sepolia';
  return 'base';
}

function resolveBaseX402Config({ chainConfig = {}, env = process.env } = {}) {
  const explicitPayTo = normalizeAddress(env.X402_PAY_TO_ADDRESS);
  const chainTreasury = normalizeAddress(chainConfig.treasury);
  const payToAddress = explicitPayTo || chainTreasury || ZERO_ADDRESS;
  const network = (env.X402_NETWORK || inferBaseX402Network(chainConfig)).trim();
  const isBuildPlaceholder = isNextProductionBuild(env) && isZeroAddress(payToAddress);

  if (!isBuildPlaceholder && (!isValidEvmAddress(payToAddress) || isZeroAddress(payToAddress))) {
    throw new Error(
      'Missing dedicated Base x402 settlement wallet: set CHAIN_BASE_TREASURY to the funded dedicated Base wallet address, or set X402_PAY_TO_ADDRESS as a legacy override.'
    );
  }

  return {
    payToAddress,
    network,
    isBuildPlaceholder,
  };
}

module.exports = {
  ZERO_ADDRESS,
  isValidEvmAddress,
  resolveBaseX402Config,
};
