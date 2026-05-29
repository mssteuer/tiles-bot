/**
 * Casper x402 client — build x402-compatible payment headers for the Casper network.
 *
 * Usage:
 *   import { createCasperPaymentHeader, createCasperSigner } from '@tiles-bot/casper-x402-client';
 *
 *   const signer = createCasperSigner(privateKeyHex, 'ed25519');
 *   const header = await createCasperPaymentHeader(signer, paymentRequirements, domain);
 *   // Set header as X-PAYMENT in HTTP request
 */

import {
  CASPER_DOMAIN_TYPES,
  TransferAuthorizationTypes,
  buildDomain,
  hashTypedData,
} from '@casper-ecosystem/casper-eip-712';
import { toHex, computeAccountHash } from './signer.js';
import type {
  CasperSigner,
  CasperPaymentRequirements,
  CasperPaymentPayload,
  CasperEIP712Domain,
  CasperNetwork,
  TransferAuthorizationMessage,
} from './types.js';

const ZERO_ADDRESS = /^0x0{40}$/i;
const BYTES32_HEX = /^[0-9a-f]{64}$/i;

function normalizeContractPackageHash(contractPackageHash: string): string {
  const clean = contractPackageHash
    .replace(/^hash-/i, '')
    .replace(/^0x/i, '')
    .toLowerCase();

  if (!BYTES32_HEX.test(clean)) {
    throw new Error('Casper contract package hash must be 32 bytes as hash-<hex>, 0x<hex>, or raw hex');
  }

  return '0x' + clean;
}

function typedDataOptions(domain: CasperEIP712Domain) {
  if (typeof domain.verifyingContract === 'string' && ZERO_ADDRESS.test(domain.verifyingContract)) {
    throw new Error('Refusing to sign with zero-address verifyingContract; use createCasperEIP712Domain() with the wCSPR contract package hash');
  }

  const hasCasperDomain = domain.chain_name !== undefined || domain.contract_package_hash !== undefined;
  if (!hasCasperDomain) return undefined;

  if (typeof domain.chain_name !== 'string' || typeof domain.contract_package_hash !== 'string') {
    throw new Error('Casper-native EIP-712 domains must include chain_name and contract_package_hash');
  }

  normalizeContractPackageHash(domain.contract_package_hash);
  return { domainTypes: CASPER_DOMAIN_TYPES };
}

/**
 * Build the Casper-native EIP-712 domain for a wCSPR CEP-18 package.
 *
 * Prefer this over hand-written domain constants: it binds signatures to the
 * actual Casper contract package hash instead of an unsafe placeholder address.
 */
export function createCasperEIP712Domain(
  network: CasperNetwork,
  contractPackageHash: string,
  name: string = 'WrappedCSPR',
  version: string = '1',
): CasperEIP712Domain {
  return buildDomain(name, version, network, normalizeContractPackageHash(contractPackageHash)) as CasperEIP712Domain;
}

/**
 * Generate a random 32-byte nonce as 0x-prefixed hex.
 */
function randomNonce(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const { randomFillSync } = require('crypto');
    randomFillSync(bytes);
  }
  return '0x' + toHex(bytes);
}

/**
 * Build an unsigned TransferAuthorization message from payment requirements.
 *
 * @param signer The CasperSigner (provides the 'from' AccountHash)
 * @param requirements The x402 PaymentRequirements from the 402 response
 * @param timeoutSeconds How long the authorization should be valid (default: from requirements)
 * @returns The TransferAuthorization message fields
 */
export function buildTransferAuthorization(
  signer: CasperSigner,
  requirements: CasperPaymentRequirements,
  timeoutSeconds?: number,
): TransferAuthorizationMessage {
  const now = Math.floor(Date.now() / 1000);
  const timeout = timeoutSeconds ?? requirements.maxTimeoutSeconds ?? 300;

  // payTo is a Casper public key hex; we need its AccountHash for the 'to' field.
  // The facilitator expects AccountHash in bytes32 format.
  // For simplicity, if payTo looks like an AccountHash already (0x-prefixed, 66 chars),
  // use it directly. Otherwise, it's a public key and we'd need to hash it.
  // The facilitator API typically provides payTo as a public key,
  // so we compute the hash from it.
  let toAccountHash: string;
  if (requirements.payTo.startsWith('0x') && requirements.payTo.length === 66) {
    toAccountHash = requirements.payTo;
  } else {
    // payTo is a Casper public key (01... or 02...) — compute AccountHash
    const prefix = requirements.payTo.slice(0, 2);
    const rawKey = requirements.payTo.slice(2);
    toAccountHash = computeAccountHash(prefix, rawKey);
  }

  return {
    from: signer.accountHash,
    to: toAccountHash,
    value: requirements.maxAmountRequired,
    valid_after: BigInt(now),
    valid_before: BigInt(now + timeout),
    nonce: randomNonce(),
  };
}

/**
 * Sign a TransferAuthorization using EIP-712 typed data hashing and the signer's key.
 *
 * @param signer The CasperSigner
 * @param domain EIP-712 domain for the wCSPR contract
 * @param message The TransferAuthorization message to sign
 * @returns Hex-encoded signature string
 */
export async function signTransferAuthorization(
  signer: CasperSigner,
  domain: CasperEIP712Domain,
  message: TransferAuthorizationMessage,
): Promise<string> {
  // Build the EIP-712 digest
  const digest = hashTypedData(
    domain,
    TransferAuthorizationTypes,
    'TransferAuthorization',
    message as unknown as Record<string, unknown>,
    typedDataOptions(domain),
  );

  // Sign the digest
  const sigBytes = await signer.sign(digest);
  return '0x' + toHex(sigBytes);
}

/**
 * Create a complete x402 payment header for the Casper network.
 *
 * This is the main entry point. Call this, then set the result as the
 * X-PAYMENT header value on your HTTP request.
 *
 * @param signer A CasperSigner (from createCasperSigner)
 * @param requirements The CasperPaymentRequirements from the 402 response
 * @param domain Optional EIP-712 domain for the wCSPR contract. If omitted, a Casper-native domain is built from requirements.asset.
 * @returns Base64-encoded payment header string
 */
export async function createCasperPaymentHeader(
  signer: CasperSigner,
  requirements: CasperPaymentRequirements,
  domain?: CasperEIP712Domain,
): Promise<string> {
  const eip712Domain = domain ?? createCasperEIP712Domain(requirements.network, requirements.asset);

  // Build the authorization message
  const authorization = buildTransferAuthorization(signer, requirements);

  // Sign it
  const signature = await signTransferAuthorization(signer, eip712Domain, authorization);

  // Construct the payload
  const payload: CasperPaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: requirements.network,
    payload: {
      signature,
      authorization,
    },
  };

  // Base64-encode the JSON payload (standard x402 encoding)
  const json = JSON.stringify(payload, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  return btoa(json);
}

/**
 * Parse a 402 response body to extract Casper-specific payment requirements.
 *
 * The x402 spec returns an array of payment requirements. This function
 * finds the one matching the Casper network.
 *
 * @param responseBody The parsed JSON body of the 402 response
 * @param network The Casper CAIP-2 network to match (default: 'casper:casper')
 * @returns The Casper payment requirements, or null if not found
 */
export function selectCasperPaymentRequirements(
  responseBody: { paymentRequirements?: CasperPaymentRequirements[] } | CasperPaymentRequirements[],
  network: string = 'casper:casper',
): CasperPaymentRequirements | null {
  const requirements = Array.isArray(responseBody)
    ? responseBody
    : responseBody.paymentRequirements ?? [];
  return requirements.find((r) => r.network === network) ?? null;
}
