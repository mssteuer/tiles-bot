/**
 * Casper x402 client types.
 *
 * These extend the x402 protocol for Casper's EIP-712-based payment authorization.
 * On Casper, the payment token is wCSPR (a CEP-18 token with transfer_with_authorization).
 * The authorization payload uses EIP-712 typed data (TransferAuthorization struct)
 * and is signed by the payer's ed25519 or secp256k1 key.
 */

// -- Casper-specific PaymentRequirements (returned in 402 response)

export interface CasperPaymentRequirements {
  /** Always 'exact' for x402 v1 */
  scheme: 'exact';
  /** CAIP-2 network identifier: 'casper:casper' (mainnet) or 'casper:casper-test' */
  network: string;
  /** wCSPR contract package hash (e.g. 'hash-8df5d2...05b6') */
  asset: string;
  /** Amount in motes (9 decimal places), as a string */
  maxAmountRequired: string;
  /** Treasury address (Casper public key hex, 01... or 02...) */
  payTo: string;
  /** URL of the resource being paid for */
  resource: string;
  /** Human-readable description */
  description: string;
  /** MIME type of the resource */
  mimeType: string;
  /** Max seconds to keep the payment valid */
  maxTimeoutSeconds: number;
  /** Extra Casper-specific fields */
  extra?: {
    /** x402 facilitator URL */
    facilitator?: string;
    /** NFT contract hash (for tiles.bot claim context) */
    nftContract?: string;
    [key: string]: unknown;
  };
}

// -- EIP-712 TransferAuthorization message (matches Casper wCSPR contract)

export interface TransferAuthorizationMessage {
  /** 0x-prefixed 32-byte hex AccountHash of the sender */
  from: string;
  /** 0x-prefixed 32-byte hex AccountHash of the recipient */
  to: string;
  /** Transfer amount as bigint or 0x-prefixed 32-byte hex (U256) */
  value: string | bigint;
  /** Unix timestamp (seconds) — authorization invalid before this */
  valid_after: number | bigint;
  /** Unix timestamp (seconds) — authorization expires after this */
  valid_before: number | bigint;
  /** 0x-prefixed 32-byte hex replay-protection nonce */
  nonce: string;
}

// -- Casper payment payload (sent in X-PAYMENT header)

export interface CasperPaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    authorization: TransferAuthorizationMessage;
  };
}

// -- Signer interface

export type CasperKeyAlgorithm = 'ed25519' | 'secp256k1';

export interface CasperSigner {
  /** Algorithm prefix byte: 01 for ed25519, 02 for secp256k1 */
  algorithm: CasperKeyAlgorithm;
  /** Full public key hex (with algo prefix, e.g. '01abcd...') */
  publicKeyHex: string;
  /** AccountHash as 0x-prefixed 32-byte hex */
  accountHash: string;
  /** Sign an EIP-712 digest (32-byte Uint8Array) and return the raw signature bytes */
  sign(digest: Uint8Array): Promise<Uint8Array>;
}

// -- Domain for Casper wCSPR EIP-712

export interface CasperEIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
  [key: string]: unknown;
}

/** Casper mainnet wCSPR domain (chainId 1514) */
export const CASPER_MAINNET_DOMAIN: CasperEIP712Domain = {
  name: 'WrappedCSPR',
  version: '1',
  chainId: 1514,
  verifyingContract: '0x0000000000000000000000000000000000000000', // placeholder, set per-deployment
};

/** Casper testnet wCSPR domain (chainId 1515) */
export const CASPER_TESTNET_DOMAIN: CasperEIP712Domain = {
  name: 'WrappedCSPR',
  version: '1',
  chainId: 1515,
  verifyingContract: '0x0000000000000000000000000000000000000000', // placeholder, set per-deployment
};
