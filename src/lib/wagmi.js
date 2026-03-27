'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';
import { http } from 'wagmi';

const IS_TESTNET = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';

export const wagmiConfig = getDefaultConfig({
  appName: 'tiles.bot — Million Bot Homepage',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: IS_TESTNET ? [baseSepolia] : [base],
  transports: IS_TESTNET
    ? { [baseSepolia.id]: http() }
    : { [base.id]: http() },
  ssr: true,
});

export const TARGET_CHAIN = IS_TESTNET ? baseSepolia : base;

// Contract address from env
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

// USDC address
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  (IS_TESTNET ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');

// Minimal ABIs
export const MBH_ABI = [
  'function claim(uint256 tokenId) external',
  'function batchClaim(uint256[] calldata tokenIds) external',
  'function currentPrice() public view returns (uint256)',
  'function ownerOf(uint256 tokenId) public view returns (address)',
  'function totalMinted() public view returns (uint256)',
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];
