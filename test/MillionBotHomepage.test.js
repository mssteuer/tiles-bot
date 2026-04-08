const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MillionBotHomepage", function () {
  let contract, mockUSDC, owner, alice, bob;

  async function deploy() {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy mock ERC20 (USDC with 6 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    await mockUSDC.waitForDeployment();

    const MillionBotHomepage = await ethers.getContractFactory("MillionBotHomepage");
    contract = await MillionBotHomepage.deploy(await mockUSDC.getAddress());
    await contract.waitForDeployment();

    // Mint USDC to alice and bob
    const amount = ethers.parseUnits("1000000", 6); // 1M USDC
    await mockUSDC.mint(alice.address, amount);
    await mockUSDC.mint(bob.address, amount);

    // Approve contract to spend USDC
    const contractAddr = await contract.getAddress();
    await mockUSDC.connect(alice).approve(contractAddr, ethers.MaxUint256);
    await mockUSDC.connect(bob).approve(contractAddr, ethers.MaxUint256);
  }

  beforeEach(deploy);

  describe("Deployment", function () {
    it("sets correct name and symbol", async function () {
      expect(await contract.name()).to.equal("MillionBotHomepage");
      expect(await contract.symbol()).to.equal("MBHP");
    });

    it("sets correct grid size", async function () {
      expect(await contract.GRID_SIZE()).to.equal(256);
      expect(await contract.MAX_SUPPLY()).to.equal(65536);
    });
  });

  describe("Pricing", function () {
    it("currentPrice() returns 1e4 when 0 minted", async function () {
      expect(await contract.currentPrice()).to.equal(10_000n);
    });

    it("bonding curve price increases after mints", async function () {
      const priceBefore = await contract.currentPrice();
      await contract.connect(alice).claim(0);
      const priceAfter = await contract.currentPrice();
      expect(priceAfter).to.be.gt(priceBefore);
    });
  });

  describe("claim()", function () {
    it("works when USDC is approved", async function () {
      await expect(contract.connect(alice).claim(42)).to.not.be.reverted;
      expect(await contract.ownerOf(42)).to.equal(alice.address);
      expect(await contract.totalMinted()).to.equal(1);
    });

    it("reverts for invalid tile ID (>65535)", async function () {
      await expect(contract.connect(alice).claim(65536)).to.be.revertedWith("Invalid tile ID");
    });

    it("reverts for already claimed tile", async function () {
      await contract.connect(alice).claim(100);
      await expect(contract.connect(bob).claim(100)).to.be.revertedWith("Tile already claimed");
    });
  });

  describe("setTileURI()", function () {
    it("works for tile owner", async function () {
      await contract.connect(alice).claim(5);
      await expect(contract.connect(alice).setTileURI(5, "ipfs://test")).to.not.be.reverted;
    });

    it("reverts for non-owner", async function () {
      await contract.connect(alice).claim(5);
      await expect(contract.connect(bob).setTileURI(5, "ipfs://test")).to.be.revertedWith("Not tile owner");
    });
  });

  describe("batchClaim()", function () {
    it("works and increases totalMinted correctly", async function () {
      const ids = [10, 20, 30, 40, 50];
      await contract.connect(alice).batchClaim(ids);
      expect(await contract.totalMinted()).to.equal(5);
      for (const id of ids) {
        expect(await contract.ownerOf(id)).to.equal(alice.address);
      }
    });
  });
});
