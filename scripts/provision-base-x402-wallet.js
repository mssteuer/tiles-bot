#!/usr/bin/env node
// — Dedicated Base x402 Wallet Provisioning

const { Wallet } = require('ethers');

function buildProvisioningPayload(wallet = Wallet.createRandom()) {
  return {
    chain: 'base',
    purpose: 'Dedicated Base wallet for tiles.bot / CSPR.trade x402 USDC settlements',
    address: wallet.address,
    privateKey: wallet.privateKey,
    env: {
      CHAIN_BASE_TREASURY: wallet.address,
      X402_NETWORK: 'base',
    },
    funding: {
      network: 'Base',
      asset: 'ETH',
      minimumSuggested: '0.005 ETH',
      note: 'Fund this wallet on Base with enough ETH for operational gas/settlement testing before enabling paid x402 traffic.',
    },
    security: [
      'Store the private key in the production secret manager only; do not commit it.',
      'Expose only CHAIN_BASE_TREASURY / X402_NETWORK to the app runtime.',
      'Rotate the wallet if the private key is pasted into chat, logs, or git.',
    ],
  };
}

function printHuman(payload) {
  console.log('Dedicated Base x402 settlement wallet generated.');
  console.log('');
  console.log(`Address: ${payload.address}`);
  console.log(`Private key: ${payload.privateKey}`);
  console.log('');
  console.log('Runtime env:');
  console.log(`CHAIN_BASE_TREASURY=${payload.env.CHAIN_BASE_TREASURY}`);
  console.log(`X402_NETWORK=${payload.env.X402_NETWORK}`);
  console.log('');
  console.log(`Funding: send at least ${payload.funding.minimumSuggested} on ${payload.funding.network} for ${payload.funding.asset} gas.`);
  console.log('Do not commit the private key. Store it in the production secret manager, then fund the public address.');
}

function main(argv = process.argv.slice(2)) {
  const payload = buildProvisioningPayload();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  printHuman(payload);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProvisioningPayload,
};
