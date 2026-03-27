'use client';

import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected, metaMask, coinbaseWallet } from 'wagmi/connectors';
import { parseAbi } from 'viem';

const IS_TESTNET = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
const TARGET = IS_TESTNET ? baseSepolia : base;

export const wagmiConfig = createConfig({
  chains: [TARGET],
  transports: {
    [TARGET.id]: http(IS_TESTNET ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
  },
  connectors: [
    injected({ target: 'metaMask' }),
    metaMask(),
    coinbaseWallet({ appName: 'tiles.bot' }),
    injected(),
  ],
  ssr: true,
});

export const TARGET_CHAIN = TARGET;
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  (IS_TESTNET ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');

export const MBH_ABI = parseAbi([
  'function claim(uint256 tokenId) external',
  'function batchClaim(uint256[] calldata tokenIds) external',
  'function currentPrice() public view returns (uint256)',
  'function ownerOf(uint256 tokenId) public view returns (address)',
  'function totalMinted() public view returns (uint256)',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);
