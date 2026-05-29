/**
 * Casper x402 client types.
 *
 * These extend the x402 protocol for Casper's EIP-712-based payment authorization.
 * On Casper, the payment token is wCSPR (a CEP-18 token with transfer_with_authorization).
 * The authorization payload uses EIP-712 typed data (TransferAuthorization struct)
 * and is signed by the payer's ed25519 or secp256k1 key.
 */
interface CasperPaymentRequirements {
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
interface TransferAuthorizationMessage {
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
interface CasperPaymentPayload {
    x402Version: number;
    scheme: 'exact';
    network: string;
    payload: {
        signature: string;
        authorization: TransferAuthorizationMessage;
    };
}
type CasperKeyAlgorithm = 'ed25519' | 'secp256k1';
interface CasperSigner {
    /** Algorithm prefix byte: 01 for ed25519, 02 for secp256k1 */
    algorithm: CasperKeyAlgorithm;
    /** Full public key hex (with algo prefix, e.g. '01abcd...') */
    publicKeyHex: string;
    /** AccountHash as 0x-prefixed 32-byte hex */
    accountHash: string;
    /** Sign an EIP-712 digest (32-byte Uint8Array) and return the raw signature bytes */
    sign(digest: Uint8Array): Promise<Uint8Array>;
}
interface CasperEIP712Domain {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
    [key: string]: unknown;
}
/** Casper mainnet wCSPR domain (chainId 1514) */
declare const CASPER_MAINNET_DOMAIN: CasperEIP712Domain;
/** Casper testnet wCSPR domain (chainId 1515) */
declare const CASPER_TESTNET_DOMAIN: CasperEIP712Domain;

/**
 * Casper key utilities — convert public keys to AccountHashes,
 * create signers from raw private keys.
 *
 * Casper AccountHash = blake2b-256(algo_byte + raw_public_key_bytes)
 * where algo_byte = 0x01 for ed25519, 0x02 for secp256k1.
 */

declare function toHex(bytes: Uint8Array): string;
declare function fromHex(hex: string): Uint8Array;
/**
 * Compute the Casper AccountHash for a public key.
 * @param algoPrefix '01' for ed25519 or '02' for secp256k1
 * @param rawPublicKeyHex The raw public key bytes as hex (no prefix)
 * @returns 0x-prefixed 32-byte hex AccountHash
 */
declare function computeAccountHash(algoPrefix: string, rawPublicKeyHex: string): string;
/**
 * Create a CasperSigner from a raw private key hex string.
 *
 * @param privateKeyHex Raw private key hex (32 bytes for ed25519, 32 bytes for secp256k1)
 * @param algorithm Key algorithm ('ed25519' or 'secp256k1')
 * @returns A CasperSigner that can sign EIP-712 digests
 */
declare function createCasperSigner(privateKeyHex: string, algorithm?: CasperKeyAlgorithm): CasperSigner;

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

/**
 * Build an unsigned TransferAuthorization message from payment requirements.
 *
 * @param signer The CasperSigner (provides the 'from' AccountHash)
 * @param requirements The x402 PaymentRequirements from the 402 response
 * @param timeoutSeconds How long the authorization should be valid (default: from requirements)
 * @returns The TransferAuthorization message fields
 */
declare function buildTransferAuthorization(signer: CasperSigner, requirements: CasperPaymentRequirements, timeoutSeconds?: number): TransferAuthorizationMessage;
/**
 * Sign a TransferAuthorization using EIP-712 typed data hashing and the signer's key.
 *
 * @param signer The CasperSigner
 * @param domain EIP-712 domain for the wCSPR contract
 * @param message The TransferAuthorization message to sign
 * @returns Hex-encoded signature string
 */
declare function signTransferAuthorization(signer: CasperSigner, domain: CasperEIP712Domain, message: TransferAuthorizationMessage): Promise<string>;
/**
 * Create a complete x402 payment header for the Casper network.
 *
 * This is the main entry point. Call this, then set the result as the
 * X-PAYMENT header value on your HTTP request.
 *
 * @param signer A CasperSigner (from createCasperSigner)
 * @param requirements The CasperPaymentRequirements from the 402 response
 * @param domain The EIP-712 domain for the wCSPR contract
 * @returns Base64-encoded payment header string
 */
declare function createCasperPaymentHeader(signer: CasperSigner, requirements: CasperPaymentRequirements, domain: CasperEIP712Domain): Promise<string>;
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
declare function selectCasperPaymentRequirements(responseBody: {
    paymentRequirements?: CasperPaymentRequirements[];
} | CasperPaymentRequirements[], network?: string): CasperPaymentRequirements | null;

export { CASPER_MAINNET_DOMAIN, CASPER_TESTNET_DOMAIN, type CasperEIP712Domain, type CasperKeyAlgorithm, type CasperPaymentPayload, type CasperPaymentRequirements, type CasperSigner, type TransferAuthorizationMessage, buildTransferAuthorization, computeAccountHash, createCasperPaymentHeader, createCasperSigner, fromHex, selectCasperPaymentRequirements, signTransferAuthorization, toHex };
