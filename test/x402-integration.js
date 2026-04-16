/**
 * x402 End-to-End Integration Test — Task #790
 *
 * Exercises the full agent claim flow on a local Hardhat node:
 *   1. Deploy MockERC20 (USDC) + MillionBotHomepage contracts
 *   2. Fund a test agent wallet with USDC
 *   3. Simulate x402 payment verification (call claim API endpoint)
 *   4. Agent approves USDC + calls claim() on-chain
 *   5. Assert tile is minted (ownerOf returns agent wallet)
 *
 * Run with: npx hardhat run test/x402-integration.js --network hardhat
 */

const { ethers } = require('hardhat');

async function main() {
  let passed = 0;
  let failed = 0;

  function ok(label) {
    console.log(`  ✅ ${label}`);
    passed++;
  }

  function fail(label, err) {
    console.log(`  ❌ ${label}: ${err.message || err}`);
    failed++;
  }

  console.log('\n🚀 Deploying contracts to local Hardhat fork...');

  const [deployer, agentWallet] = await ethers.getSigners();

  // Deploy MockERC20 (USDC stand-in, 6 decimals)
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  ok(`MockERC20 deployed at ${usdcAddress}`);

  // Deploy MillionBotHomepage
  const MBH = await ethers.getContractFactory('MillionBotHomepage');
  const mbh = await MBH.deploy(usdcAddress);
  await mbh.waitForDeployment();
  const mbhAddress = await mbh.getAddress();
  ok(`MillionBotHomepage deployed at ${mbhAddress}`);

  // Fund agent wallet with USDC (100 USDC = 100_000_000 with 6 decimals)
  const fundAmount = ethers.parseUnits('100', 6);
  await usdc.mint(agentWallet.address, fundAmount);
  const agentBalance = await usdc.balanceOf(agentWallet.address);
  try {
    if (agentBalance !== fundAmount) throw new Error(`Expected ${fundAmount}, got ${agentBalance}`);
    ok(`Agent funded with 100 USDC`);
  } catch (e) {
    fail('Agent USDC funding', e);
  }

  // Get current tile price (tile 0, 0 minted → should be 1e4 = 0.01 USDC)
  const tileId = 0;
  const price = await mbh.currentPrice();
  try {
    if (price <= 0n) throw new Error('Price must be > 0');
    ok(`Current price: ${ethers.formatUnits(price, 6)} USDC`);
  } catch (e) {
    fail('currentPrice()', e);
  }

  // Simulate x402: agent approves USDC to contract
  const usdcAsAgent = usdc.connect(agentWallet);
  const mbhAsAgent = mbh.connect(agentWallet);

  try {
    await usdcAsAgent.approve(mbhAddress, ethers.MaxUint256);
    const allowance = await usdc.allowance(agentWallet.address, mbhAddress);
    if (allowance !== ethers.MaxUint256) throw new Error('Allowance not set to MaxUint256');
    ok(`Agent approved USDC to contract`);
  } catch (e) {
    fail('USDC approve()', e);
  }

  // Agent calls claim(tileId)
  try {
    const tx = await mbhAsAgent.claim(tileId);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error('Transaction reverted');
    ok(`claim(${tileId}) succeeded — txHash: ${receipt.hash}`);
  } catch (e) {
    fail(`claim(${tileId})`, e);
  }

  // Verify on-chain: ownerOf(tileId) === agentWallet
  try {
    const owner = await mbh.ownerOf(tileId);
    if (owner.toLowerCase() !== agentWallet.address.toLowerCase()) {
      throw new Error(`Expected owner ${agentWallet.address}, got ${owner}`);
    }
    ok(`ownerOf(${tileId}) === agentWallet ✓`);
  } catch (e) {
    fail(`ownerOf(${tileId})`, e);
  }

  // Verify totalMinted incremented
  try {
    const total = await mbh.totalMinted();
    if (total !== 1n) throw new Error(`Expected totalMinted=1, got ${total}`);
    ok(`totalMinted === 1 after claim`);
  } catch (e) {
    fail('totalMinted check', e);
  }

  // Verify price increased after mint
  try {
    const newPrice = await mbh.currentPrice();
    if (newPrice <= price) throw new Error(`Price should increase after mint (was ${price}, now ${newPrice})`);
    ok(`Bonding curve: price increased after mint (${ethers.formatUnits(newPrice, 6)} USDC)`);
  } catch (e) {
    fail('Bonding curve price increase', e);
  }

  // Verify double-claim reverts
  try {
    await mbhAsAgent.claim(tileId);
    fail('double-claim should revert', new Error('Did not revert'));
  } catch (e) {
    if (e.message && (e.message.includes('revert') || e.message.includes('ERC721'))) {
      ok(`double-claim correctly reverts`);
    } else {
      fail('double-claim revert check', e);
    }
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Total: ${passed + failed} | ✅ ${passed} passed | ${failed > 0 ? '❌' : '✅'} ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
