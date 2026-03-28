import { ethers } from 'ethers';
import { createPublicClient, http, parseAbi, hashMessage, getAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '8453';

function getPublicClient() {
  const chain = CHAIN_ID === '84532' ? baseSepolia : base;
  return createPublicClient({
    chain,
    transport: http(CHAIN_ID === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
  });
}

/**
 * Verify a wallet signature — supports both EOA and ERC-1271 smart wallets.
 * 
 * @param {string} message - The original message that was signed
 * @param {string} signature - The signature hex string
 * @param {string} claimedAddress - The address claiming to have signed
 * @returns {Promise<boolean>} true if verified
 */
export async function verifyWalletSignature(message, signature, claimedAddress) {
  // 1) Try EOA recovery
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() === claimedAddress.toLowerCase()) {
      return true;
    }
  } catch { /* not an EOA sig */ }

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

/**
 * Check on-chain ownership of a tile.
 * @returns {Promise<boolean>}
 */
export async function verifyTileOwnership(tileId, walletAddress) {
  try {
    const publicClient = getPublicClient();
    const OWNER_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);
    const onChainOwner = await publicClient.readContract({
      address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
      abi: OWNER_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tileId)],
    });
    return onChainOwner.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    return false;
  }
}
