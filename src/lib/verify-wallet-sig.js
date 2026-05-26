import { ethers } from 'ethers';
import { createPublicClient, http, parseAbi, hashMessage, getAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { blake2b } from '@noble/hashes/blake2b';

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

// — Address Format Detection

const EVM_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const CASPER_PATTERN = /^(01|02)[0-9a-fA-F]{64,66}$/;

/**
 * Detect chain type from address format.
 * @param {string} address
 * @returns {'evm'|'casper'|null}
 */
export function detectAddressChain(address) {
  if (!address || typeof address !== 'string') return null;
  if (EVM_PATTERN.test(address)) return 'evm';
  if (CASPER_PATTERN.test(address)) return 'casper';
  return null;
}

// — EVM Verification

function getPublicClient() {
  const chain = CHAIN_ID === '84532' ? baseSepolia : base;
  return createPublicClient({
    chain,
    transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
  });
}

/**
 * Verify an EVM EOA signature (ethers.verifyMessage).
 * @param {string} message - plaintext message
 * @param {string} signature - hex signature
 * @param {string} claimedAddress - 0x address
 * @returns {boolean}
 */
export function verifyEvmEoaSignature(message, signature, claimedAddress) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === claimedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// — Casper Verification

/**
 * Verify a Casper wallet signature.
 *
 * Casper signatures are prefixed with an algo byte:
 *   01 = ed25519 (sig is 64 bytes)
 *   02 = secp256k1 (sig is 64 bytes compact)
 *
 * The message is hashed with blake2b-256 before signing (standard Casper convention).
 * The public key is extracted from the Casper address (strip the algo prefix byte).
 *
 * @param {string} message - plaintext message
 * @param {string} signature - hex string with algo byte prefix (e.g., "01" + 128 hex chars)
 * @param {string} casperAddress - Casper public key address ("01..." or "02...")
 * @returns {boolean}
 */
export function verifyCasperSignature(message, signature, casperAddress) {
  try {
    if (!signature || signature.length < 4) return false;

    const sigAlgoByte = signature.slice(0, 2);
    const sigHex = signature.slice(2);
    const sigBytes = hexToBytes(sigHex);
    if (!sigBytes) return false;

    // Hash message with blake2b-256 (Casper convention)
    const msgBytes = new TextEncoder().encode(message);
    const msgHash = blake2b(msgBytes, { dkLen: 32 });

    // Extract public key from address (strip the algo prefix)
    const addrAlgoByte = casperAddress.slice(0, 2);
    const pubKeyHex = casperAddress.slice(2);
    const pubKeyBytes = hexToBytes(pubKeyHex);
    if (!pubKeyBytes) return false;

    if (sigAlgoByte === '01' && addrAlgoByte === '01') {
      // ed25519: signature is 64 bytes
      if (sigBytes.length !== 64) return false;
      return ed25519.verify(sigBytes, msgHash, pubKeyBytes);
    } else if (sigAlgoByte === '02' && addrAlgoByte === '02') {
      // secp256k1: signature is 64 bytes (compact r||s)
      if (sigBytes.length !== 64) return false;
      return secp256k1.verify(sigBytes, msgHash, pubKeyBytes);
    }

    // Algo byte mismatch or unknown
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse hex string to Uint8Array. Returns null on invalid hex.
 */
function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// — Chain-Aware Unified Verification

/**
 * Verify a wallet signature — supports EVM (EOA + ERC-1271) and Casper (ed25519 + secp256k1).
 * Detects chain by address format.
 *
 * @param {string} message - The original message that was signed
 * @param {string} signature - The signature hex string
 * @param {string} claimedAddress - The address claiming to have signed
 * @returns {Promise<boolean>} true if verified
 */
export async function verifyWalletSignature(message, signature, claimedAddress) {
  const chain = detectAddressChain(claimedAddress);

  if (chain === 'casper') {
    return verifyCasperSignature(message, signature, claimedAddress);
  }

  if (chain === 'evm') {
    // 1) Try EOA recovery
    if (verifyEvmEoaSignature(message, signature, claimedAddress)) {
      return true;
    }

    // 2) Try ERC-1271 isValidSignature on the claimed address (smart wallet)
    try {
      const publicClient = getPublicClient();
      const ERC1271_ABI = parseAbi([
        'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
      ]);
      const msgHash = hashMessage(message);
      const result = await publicClient.readContract({
        address: getAddress(claimedAddress),
        abi: ERC1271_ABI,
        functionName: 'isValidSignature',
        args: [msgHash, signature],
      });
      // ERC-1271 magic value
      if (result === '0x1626ba7e') {
        return true;
      }
    } catch (e) {
      console.log('[verify-wallet-sig] ERC-1271 check failed:', e.message?.slice(0, 120));
    }

    return false;
  }

  // Unknown address format
  console.log('[verify-wallet-sig] Unrecognized address format:', claimedAddress?.slice(0, 20));
  return false;
}

/**
 * Check ownership of a tile — on-chain first, then DB fallback.
 * Many tiles are claimed in the DB but not yet minted on-chain,
 * so we accept DB ownership when the token doesn't exist on-chain.
 * @returns {Promise<boolean>}
 */
export async function verifyTileOwnership(tileId, walletAddress) {
  // 1) Try on-chain ownerOf (EVM only for now)
  const chain = detectAddressChain(walletAddress);
  if (chain === 'evm') {
    try {
      const contractAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      if (contractAddr) {
        const publicClient = getPublicClient();
        const OWNER_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);
        const onChainOwner = await publicClient.readContract({
          address: contractAddr,
          abi: OWNER_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tileId)],
        });
        return onChainOwner.toLowerCase() === walletAddress.toLowerCase();
      }
    } catch {
      // ownerOf reverted — token likely not minted yet, fall through to DB check
    }
  }

  // 2) Fallback: check DB ownership (works for both chains)
  try {
    const { getTile } = await import('@/lib/db');
    const tile = getTile(tileId);
    if (tile && tile.owner) {
      return tile.owner.toLowerCase() === walletAddress.toLowerCase();
    }
  } catch {
    // DB unavailable
  }

  return false;
}
