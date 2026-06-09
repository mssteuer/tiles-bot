'use client';

import CasperSdk from 'casper-js-sdk';

const {
  Args,
  CasperNetwork,
  CLTypeUInt256,
  CLValue,
  HttpHandler,
  Key,
  PublicKey,
  RpcClient,
  TransactionV1,
} = CasperSdk;

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_GAS_PRICE_TOLERANCE = 1;
const APPROVE_GAS_PAYMENT = '5000000000'; // 5 CSPR
const CLAIM_GAS_PAYMENT = '5000000000'; // 5 CSPR
const TRANSACTION_TIMEOUT_MS = 180000;

function cleanHash(hash) {
  return String(hash || '').replace(/^hash-/, '').replace(/^0x/, '');
}

function assertHash(name, hash) {
  const value = cleanHash(hash);
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} is not configured for Casper transactions.`);
  }
  return value;
}

function assertPublicKey(publicKey) {
  if (!/^(01|02)[0-9a-fA-F]{64}$/.test(publicKey || '')) {
    throw new Error('Connect a valid Casper account before signing.');
  }
}

export function csprToMotes(cspr) {
  const value = Number(cspr);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid CSPR amount: ${cspr}`);
  }
  return String(Math.round(value * 1_000_000_000));
}

async function createCasperNetwork(rpcUrl) {
  if (!rpcUrl) throw new Error('Casper RPC URL is not configured.');
  return CasperNetwork.create(new RpcClient(new HttpHandler(rpcUrl)));
}

async function createContractPackageCallTransaction({
  publicKey,
  rpcUrl,
  chainName,
  contractPackageHash,
  entryPoint,
  gasPayment,
  runtimeArgs,
}) {
  assertPublicKey(publicKey);
  const packageHash = assertHash('Casper contract package hash', contractPackageHash);
  const network = await createCasperNetwork(rpcUrl);
  return network.createContractPackageCallTransaction(
    PublicKey.fromHex(publicKey),
    packageHash,
    entryPoint,
    chainName || 'casper',
    Number(gasPayment),
    runtimeArgs,
    DEFAULT_TTL_MS,
    undefined,
    DEFAULT_GAS_PRICE_TOLERANCE
  );
}

function transactionPayload(transaction) {
  const json = typeof TransactionV1?.toJSON === 'function'
    ? TransactionV1.toJSON(transaction)
    : transaction.toJSON();
  return JSON.stringify({
    transaction: {
      Version1: json,
    },
  });
}

export async function sendCasperTransaction(clickRef, transaction, publicKey, { onSent } = {}) {
  if (!clickRef?.send) throw new Error('CSPR.click is not ready. Reconnect your Casper wallet and try again.');
  assertPublicKey(publicKey);

  let sentHash = null;
  let settled = false;

  const processed = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      if (!settled) reject(new Error('Timed out waiting for Casper transaction processing.'));
    }, TRANSACTION_TIMEOUT_MS);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      fn(value);
    };

    const statusUpdate = (status, data = {}) => {
      if (status === 'sent') {
        sentHash = data.transactionHash || data.deployHash || sentHash;
        if (sentHash) onSent?.(sentHash);
        return;
      }
      if (status === 'processed') {
        if (data.error || data.errorData) finish(reject, data.error || data.errorData);
        else finish(resolve, sentHash || data.transactionHash || data.deployHash || null);
        return;
      }
      if (status === 'expired') finish(reject, new Error('Casper transaction expired.'));
      if (status === 'timeout') finish(reject, new Error('Casper transaction monitoring timed out.'));
      if (status === 'error') finish(reject, data.error || data.errorData || new Error('Casper transaction failed.'));
    };

    clickRef.send(transactionPayload(transaction), publicKey, statusUpdate)
      .then((result) => {
        if (result?.cancelled) finish(reject, new Error('Transaction was cancelled.'));
        if (result?.error) finish(reject, new Error(String(result.error)));
        const hash = result?.transactionHash || result?.deployHash;
        if (hash && !sentHash) {
          sentHash = hash;
          onSent?.(hash);
        }
      })
      .catch((err) => finish(reject, err));
  });

  const processedHash = await processed;
  return processedHash || sentHash;
}

export async function buildWcsprApproveTransaction({ publicKey, chainConfig, amountMotes }) {
  const spenderHash = assertHash('Casper NFT contract package hash', chainConfig?.nftContract);
  const args = Args.fromMap({
    spender: CLValue.newCLKey(Key.newKey(`hash-${spenderHash}`)),
    amount: CLValue.newCLUInt256(String(amountMotes)),
  });

  return createContractPackageCallTransaction({
    publicKey,
    rpcUrl: chainConfig.rpcUrl,
    chainName: chainConfig.chainName,
    contractPackageHash: chainConfig.paymentToken,
    entryPoint: 'approve',
    gasPayment: APPROVE_GAS_PAYMENT,
    runtimeArgs: args,
  });
}

export async function buildTileClaimTransaction({ publicKey, chainConfig, tileId }) {
  const args = Args.fromMap({
    token_id: CLValue.newCLUInt256(String(tileId)),
  });

  return createContractPackageCallTransaction({
    publicKey,
    rpcUrl: chainConfig.rpcUrl,
    chainName: chainConfig.chainName,
    contractPackageHash: chainConfig.nftContract,
    entryPoint: 'claim',
    gasPayment: CLAIM_GAS_PAYMENT,
    runtimeArgs: args,
  });
}

export async function buildBatchTileClaimTransaction({ publicKey, chainConfig, tileIds }) {
  const args = Args.fromMap({
    token_ids: CLValue.newCLList(
      CLTypeUInt256,
      tileIds.map((tileId) => CLValue.newCLUInt256(String(tileId)))
    ),
  });

  return createContractPackageCallTransaction({
    publicKey,
    rpcUrl: chainConfig.rpcUrl,
    chainName: chainConfig.chainName,
    contractPackageHash: chainConfig.nftContract,
    entryPoint: 'batch_claim',
    gasPayment: CLAIM_GAS_PAYMENT,
    runtimeArgs: args,
  });
}
