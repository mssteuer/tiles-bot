/**
 * Casper key utilities — convert public keys to AccountHashes,
 * create signers from raw private keys.
 *
 * Casper AccountHash = blake2b-256(algo_byte + raw_public_key_bytes)
 * where algo_byte = 0x01 for ed25519, 0x02 for secp256k1.
 */

import { blake2b } from '@noble/hashes/blake2b';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { CasperSigner, CasperKeyAlgorithm } from './types.js';

// -- Hex utilities

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// -- AccountHash computation

/**
 * Compute the Casper AccountHash for a public key.
 * @param algoPrefix '01' for ed25519 or '02' for secp256k1
 * @param rawPublicKeyHex The raw public key bytes as hex (no prefix)
 * @returns 0x-prefixed 32-byte hex AccountHash
 */
export function computeAccountHash(algoPrefix: string, rawPublicKeyHex: string): string {
  const algoByte = algoPrefix === '01' ? 0x01 : 0x02;
  const rawKeyBytes = fromHex(rawPublicKeyHex);
  const input = new Uint8Array(1 + rawKeyBytes.length);
  input[0] = algoByte;
  input.set(rawKeyBytes, 1);
  const hash = blake2b(input, { dkLen: 32 });
  return '0x' + toHex(hash);
}

// -- Signer from raw private key

/**
 * Create a CasperSigner from a raw private key hex string.
 *
 * @param privateKeyHex Raw private key hex (32 bytes for ed25519, 32 bytes for secp256k1)
 * @param algorithm Key algorithm ('ed25519' or 'secp256k1')
 * @returns A CasperSigner that can sign EIP-712 digests
 */
export function createCasperSigner(
  privateKeyHex: string,
  algorithm: CasperKeyAlgorithm = 'ed25519'
): CasperSigner {
  const clean = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const privKeyBytes = fromHex(clean);

  let rawPublicKeyHex: string;
  let algoPrefix: string;

  if (algorithm === 'ed25519') {
    const pubKey = ed25519.getPublicKey(privKeyBytes);
    rawPublicKeyHex = toHex(pubKey);
    algoPrefix = '01';
  } else {
    const pubKey = secp256k1.getPublicKey(privKeyBytes, true); // compressed
    rawPublicKeyHex = toHex(pubKey);
    algoPrefix = '02';
  }

  const publicKeyHex = algoPrefix + rawPublicKeyHex;
  const accountHash = computeAccountHash(algoPrefix, rawPublicKeyHex);

  return {
    algorithm,
    publicKeyHex,
    accountHash,
    async sign(digest: Uint8Array): Promise<Uint8Array> {
      if (algorithm === 'ed25519') {
        return ed25519.sign(digest, privKeyBytes);
      } else {
        const sig = secp256k1.sign(digest, privKeyBytes);
        // Return 65-byte signature: r (32) + s (32) + v (1)
        const r = sig.r.toString(16).padStart(64, '0');
        const s = sig.s.toString(16).padStart(64, '0');
        const v = sig.recovery === 0 ? '1b' : '1c'; // 27 or 28
        return fromHex(r + s + v);
      }
    },
  };
}

export { toHex, fromHex };
