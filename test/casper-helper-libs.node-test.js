const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadCasperTransactions() {
  const calls = {
    networkCreate: [],
    publicKeys: [],
    contractCalls: [],
    keyCalls: [],
  };

  class RpcClient {
    constructor(handler) { this.handler = handler; }
  }
  class HttpHandler {
    constructor(url) { this.url = url; }
  }

  const CasperSdk = {
    Args: {
      fromMap(map) {
        return { kind: 'Args', map };
      },
    },
    CasperNetwork: {
      async create(client) {
        calls.networkCreate.push(client);
        return {
          createContractPackageCallTransaction(publicKey, packageHash, entryPoint, chainName, gasPayment, runtimeArgs, ttl, dependencies, gasPriceTolerance) {
            const tx = {
              publicKey,
              packageHash,
              entryPoint,
              chainName,
              gasPayment,
              runtimeArgs,
              ttl,
              dependencies,
              gasPriceTolerance,
            };
            calls.contractCalls.push(tx);
            return tx;
          },
        };
      },
    },
    CLTypeUInt256: { kind: 'UInt256' },
    CLValue: {
      newCLKey(value) { return { clType: 'Key', value }; },
      newCLUInt256(value) { return { clType: 'UInt256', value }; },
      newCLList(type, values) { return { clType: 'List', type, values }; },
    },
    HttpHandler,
    Key: {
      newKey(value) {
        calls.keyCalls.push(value);
        return { key: value };
      },
    },
    PublicKey: {
      fromHex(value) {
        calls.publicKeys.push(value);
        return { publicKey: value };
      },
    },
    RpcClient,
    TransactionV1: {
      toJSON(transaction) {
        return { mockedTransaction: transaction.entryPoint || 'unknown' };
      },
    },
  };

  let source = readSource('src/lib/casper-transactions.js')
    .replace("'use client';", '')
    .replace("import CasperSdk from 'casper-js-sdk';", 'const CasperSdk = __mocks.CasperSdk;')
    .replace(/export async function /g, 'async function ')
    .replace(/export function /g, 'function ');

  if (/^import |^export /m.test(source)) {
    throw new Error('casper-transactions test loader failed to replace all ESM syntax');
  }

  const context = {
    __mocks: { CasperSdk },
    module: { exports: {} },
    exports: {},
    console,
    window: {
      setTimeout: (...args) => setTimeout(...args),
      clearTimeout: (...args) => clearTimeout(...args),
    },
  };

  vm.runInNewContext(`${source}\nmodule.exports = { csprToMotes, sendCasperTransaction, buildWcsprApproveTransaction, buildTileClaimTransaction, buildBatchTileClaimTransaction };`, context, {
    filename: path.join(ROOT, 'src/lib/casper-transactions.js'),
  });
  return { api: context.module.exports, calls };
}

function loadCasperWalletPureExports(env = {}) {
  const source = readSource('src/lib/casper-wallet.js');
  const componentStart = source.indexOf('export function CasperWalletProvider');
  assert.ok(componentStart > 0, 'CasperWalletProvider boundary should exist');

  let pureSource = source.slice(0, componentStart)
    .replace("'use client';", '')
    .replace("import { createContext, useContext, useState, useCallback, useRef } from 'react';", 'const { createContext, useContext, useState, useCallback, useRef } = __mocks.react;')
    .replace("import { CONTENT_MODE } from '@make-software/csprclick-core-types';", 'const { CONTENT_MODE } = __mocks.csprClickTypes;')
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ');

  if (/^import |^export /m.test(pureSource)) {
    throw new Error('casper-wallet test loader failed to replace all ESM syntax');
  }

  const context = {
    __mocks: {
      react: {
        createContext: (value) => ({ value }),
        useContext: (ctx) => ctx.value,
        useState: (initial) => [initial, () => {}],
        useCallback: (fn) => fn,
        useRef: (initial) => ({ current: initial }),
      },
      csprClickTypes: { CONTENT_MODE: { IFRAME: 'IFRAME', POPUP: 'POPUP' } },
    },
    module: { exports: {} },
    exports: {},
    process: { env: { ...env } },
  };

  vm.runInNewContext(`${pureSource}\nmodule.exports = { CSPR_CLICK_OPTIONS, CasperWalletContext, useCasperWallet, accountFromEvent, truncatePublicKey };`, context, {
    filename: path.join(ROOT, 'src/lib/casper-wallet.js'),
  });
  return context.module.exports;
}

function validPublicKey(prefix = '01') {
  return prefix + 'a'.repeat(64);
}

function validHash(char = 'b') {
  return char.repeat(64);
}

const chainConfig = {
  rpcUrl: 'https://node.casper.test/rpc',
  chainName: 'casper-test',
  nftContract: `hash-${validHash('c')}`,
  paymentToken: `0x${validHash('d')}`,
};

describe('casper-transactions helper coverage', () => {
  it('converts CSPR to motes and rejects invalid amounts', () => {
    const { api } = loadCasperTransactions();

    assert.equal(api.csprToMotes(5), '5000000000');
    assert.equal(api.csprToMotes('0.25'), '250000000');
    assert.equal(api.csprToMotes(0), '0');
    assert.throws(() => api.csprToMotes(-1), /Invalid CSPR amount/);
    assert.throws(() => api.csprToMotes('not-a-number'), /Invalid CSPR amount/);
  });

  it('builds a wCSPR approve transaction with cleaned package hashes and UInt256 amount args', async () => {
    const { api, calls } = loadCasperTransactions();

    const tx = await api.buildWcsprApproveTransaction({
      publicKey: validPublicKey(),
      chainConfig,
      amountMotes: '123000000000',
    });

    assert.equal(tx.entryPoint, 'approve');
    assert.equal(tx.packageHash, validHash('d'));
    assert.equal(tx.chainName, 'casper-test');
    assert.equal(tx.gasPayment, 5000000000);
    assert.equal(tx.ttl, 30 * 60 * 1000);
    assert.equal(tx.gasPriceTolerance, 1);
    assert.equal(calls.publicKeys[0], validPublicKey());
    assert.equal(calls.networkCreate[0].handler.url, 'https://node.casper.test/rpc');
    assert.equal(tx.runtimeArgs.map.spender.value.key, `hash-${validHash('c')}`);
    assert.deepEqual(tx.runtimeArgs.map.amount, { clType: 'UInt256', value: '123000000000' });
  });

  it('builds claim and batch-claim transactions with token id args', async () => {
    const { api } = loadCasperTransactions();

    const claimTx = await api.buildTileClaimTransaction({
      publicKey: validPublicKey('02'),
      chainConfig,
      tileId: 42,
    });
    assert.equal(claimTx.entryPoint, 'claim');
    assert.equal(claimTx.packageHash, validHash('c'));
    assert.deepEqual(claimTx.runtimeArgs.map.token_id, { clType: 'UInt256', value: '42' });

    const batchTx = await api.buildBatchTileClaimTransaction({
      publicKey: validPublicKey(),
      chainConfig,
      tileIds: [1, 2, 65535],
    });
    assert.equal(batchTx.entryPoint, 'batch_claim');
    assert.deepEqual(batchTx.runtimeArgs.map.token_ids.values.map((v) => v.value), ['1', '2', '65535']);
  });

  it('rejects invalid public keys and missing hashes before constructing deploys', async () => {
    const { api, calls } = loadCasperTransactions();

    await assert.rejects(
      () => api.buildTileClaimTransaction({ publicKey: 'bad-key', chainConfig, tileId: 1 }),
      /Connect a valid Casper account/
    );
    await assert.rejects(
      () => api.buildWcsprApproveTransaction({ publicKey: validPublicKey(), chainConfig: { ...chainConfig, nftContract: 'hash-not-hex' }, amountMotes: '1' }),
      /Casper NFT contract package hash is not configured/
    );
    assert.equal(calls.contractCalls.length, 0);
  });

  it('serializes transactions for CSPR.click and resolves when processing completes', async () => {
    const { api } = loadCasperTransactions();
    const sent = [];
    const statuses = [];
    const clickRef = {
      async send(payload, publicKey, statusUpdate) {
        statuses.push({ payload: JSON.parse(payload), publicKey });
        statusUpdate('sent', { transactionHash: 'deploy-sent' });
        statusUpdate('processed', {});
        return { transactionHash: 'deploy-result' };
      },
    };

    const result = await api.sendCasperTransaction(clickRef, { entryPoint: 'claim' }, validPublicKey(), {
      onSent: (hash) => sent.push(hash),
    });

    assert.equal(result, 'deploy-sent');
    assert.deepEqual(sent, ['deploy-sent']);
    assert.deepEqual(statuses[0].payload, { transaction: { Version1: { mockedTransaction: 'claim' } } });
    assert.equal(statuses[0].publicKey, validPublicKey());
  });

  it('normalizes CSPR.click readiness, cancellation, expiry, and processing errors', async () => {
    const { api } = loadCasperTransactions();

    await assert.rejects(
      () => api.sendCasperTransaction(null, { entryPoint: 'claim' }, validPublicKey()),
      /CSPR\.click is not ready/
    );
    await assert.rejects(
      () => api.sendCasperTransaction({ send: async () => ({ cancelled: true }) }, { entryPoint: 'claim' }, validPublicKey()),
      /Transaction was cancelled/
    );
    await assert.rejects(
      () => api.sendCasperTransaction({ send: async (_payload, _key, statusUpdate) => statusUpdate('expired') }, { entryPoint: 'claim' }, validPublicKey()),
      /Casper transaction expired/
    );
    await assert.rejects(
      () => api.sendCasperTransaction({ send: async (_payload, _key, statusUpdate) => statusUpdate('processed', { error: new Error('rejected by node') }) }, { entryPoint: 'claim' }, validPublicKey()),
      /rejected by node/
    );
  });
});

describe('casper-wallet pure helper coverage', () => {
  it('pins CSPR.click to iframe mode with menuItems and network-specific chain name', () => {
    const mainnet = loadCasperWalletPureExports({ NEXT_PUBLIC_CSPRCLICK_APP_ID: 'app-main', NEXT_PUBLIC_CASPER_NETWORK: 'casper' });
    assert.equal(mainnet.CSPR_CLICK_OPTIONS.appName, 'tiles.bot');
    assert.equal(mainnet.CSPR_CLICK_OPTIONS.appId, 'app-main');
    assert.equal(mainnet.CSPR_CLICK_OPTIONS.contentMode, 'IFRAME');
    assert.deepEqual(Array.from(mainnet.CSPR_CLICK_OPTIONS.menuItems), []);
    assert.equal(mainnet.CSPR_CLICK_OPTIONS.chainName, 'casper');
    assert.ok(mainnet.CSPR_CLICK_OPTIONS.providers.includes('casper-wallet'));

    const testnet = loadCasperWalletPureExports({ NEXT_PUBLIC_CASPER_NETWORK: 'casper-test' });
    assert.equal(testnet.CSPR_CLICK_OPTIONS.chainName, 'casper-test');
  });

  it('detects accounts across direct, detail, data, and array-shaped CSPR.click events', () => {
    const { accountFromEvent } = loadCasperWalletPureExports();
    const account = { public_key: validPublicKey(), provider: 'casper-wallet' };

    assert.equal(accountFromEvent({ account }), account);
    assert.equal(accountFromEvent({ detail: { account } }), account);
    assert.equal(accountFromEvent({ data: { account } }), account);
    assert.equal(accountFromEvent([{ account }]), account);
    assert.equal(accountFromEvent({}), null);
    assert.equal(accountFromEvent(null), null);
  });

  it('truncates valid display keys and keeps no-provider control paths non-throwing', () => {
    const { truncatePublicKey } = loadCasperWalletPureExports();
    const source = readSource('src/lib/casper-wallet.js');

    assert.equal(truncatePublicKey(validPublicKey()), '01aaaa...aaaa');
    assert.equal(truncatePublicKey('short'), 'short');
    assert.equal(truncatePublicKey(null), '');
    assert.match(source, /clickRef\.current\?\.signIn\?\.\(\)/, 'signIn no-provider path uses optional chaining');
    assert.match(source, /if \(provider && ref\?\.switchAccount\) ref\.switchAccount\(provider\);\n\s*else ref\?\.signIn\?\.\(\);/, 'switchAccount falls back safely when no provider-specific switch exists');
    assert.match(source, /clickRef\.current\?\.signOut\?\.\(\)/, 'signOut no-provider path uses optional chaining');
  });
});
