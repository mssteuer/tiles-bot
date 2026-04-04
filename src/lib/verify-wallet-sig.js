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
 * Check ownership of a tile — on-chain first, then DB fallback.
 * Many tiles are claimed in the DB but not yet minted on-chain,
 * so we accept DB ownership when the token doesn't exist on-chain.
 * @returns {Promise<boolean>}
 */
export async function verifyTileOwnership(tileId, walletAddress) {
  // 1) Try on-chain ownerOf
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

  // 2) Fallback: check DB ownership
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
