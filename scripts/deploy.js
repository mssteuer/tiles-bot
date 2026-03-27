const hre = require("hardhat");

async function main() {
  const networkName = hre.network.name;

  const USDC_ADDRESSES = {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  };

  const usdcAddress = USDC_ADDRESSES[networkName];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for network: ${networkName}`);
  }

  console.log(`Deploying MillionBotHomepage on ${networkName}...`);
  console.log(`USDC address: ${usdcAddress}`);

  const MillionBotHomepage = await hre.ethers.getContractFactory("MillionBotHomepage");
  const contract = await MillionBotHomepage.deploy(usdcAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`MillionBotHomepage deployed to: ${address}`);

  // Set placeholder base metadata URI
  const tx = await contract.setBaseMetadataURI("https://api.millionbothomepage.com/metadata/");
  await tx.wait();
  console.log("Base metadata URI set.");

  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network ${networkName} ${address} "${usdcAddress}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
