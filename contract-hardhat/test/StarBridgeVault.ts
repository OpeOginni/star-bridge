import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { parseUnits } from "ethers";

describe("StarBridgeVault", function () {
  async function deployVaultFixture() {
    const [owner, user] = await hre.ethers.getSigners();

    // Deploy test token
    const TestToken = await hre.ethers.getContractFactory("TestFT");
    const testToken = await TestToken.deploy();
    
    // Deploy vault with initial accepted tokens
    const StarBridgeVault = await hre.ethers.getContractFactory("StarBridgeVault");
    const vault = await StarBridgeVault.deploy([await testToken.getAddress()]);

    // Transfer some tokens to user for testing
    const INITIAL_AMOUNT = BigInt(100_000);
    await testToken.mint(owner, INITIAL_AMOUNT)
    await testToken.transfer(user.address, INITIAL_AMOUNT);

    return { 
      vault, 
      testToken, 
      owner, 
      user,
      INITIAL_AMOUNT
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct accepted tokens", async function () {
      const { vault, testToken } = await loadFixture(deployVaultFixture);
      expect(await vault.isTokenAccepted(testToken.target)).to.be.true;
    });
  });

  describe("Token Management", function () {
    it("Should allow owner to add accepted token", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      
      const NewToken = await hre.ethers.getContractFactory("TestFT");
      const newToken = await NewToken.deploy();

      await vault.addAcceptedToken(newToken.target);
      expect(await vault.isTokenAccepted(newToken.target)).to.be.true;
    });

    it("Should allow owner to remove accepted token", async function () {
      const { vault, testToken, owner } = await loadFixture(deployVaultFixture);
      
      await vault.removeAcceptedToken(testToken.target);
      expect(await vault.isTokenAccepted(testToken.target)).to.be.false;
    });

    it("Should not allow non-owner to add token", async function () {
      const { vault, user } = await loadFixture(deployVaultFixture);
      
      const NewToken = await hre.ethers.getContractFactory("TestFT");
      const newToken = await NewToken.deploy();

      await expect(
        vault.connect(user).addAcceptedToken(newToken.target)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should not allow non-owner to remove token", async function () {
      const { vault, testToken, user } = await loadFixture(deployVaultFixture);
      
      await expect(
        vault.connect(user).removeAcceptedToken(testToken.target)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("Token Operations", function () {
    it("Should allow deposit of accepted tokens", async function () {
      const { vault, testToken, user } = await loadFixture(deployVaultFixture);
      const amount = BigInt(100)
      
      await testToken.connect(user).approve(vault.target, amount);
      await vault.connect(user).deposit(testToken.target, amount);

      expect(await testToken.balanceOf(vault.target)).to.equal(amount);
    });

    it("Should not allow deposit of non-accepted tokens", async function () {
      const { vault, user } = await loadFixture(deployVaultFixture);
      
      const NonAcceptedToken = await hre.ethers.getContractFactory("TestFT");
      const nonAcceptedToken = await NonAcceptedToken.deploy();

      const amount = BigInt(100);
      await nonAcceptedToken.connect(user).approve(vault.target, amount);
      
      await expect(
        vault.connect(user).deposit(nonAcceptedToken.target, amount)
      ).to.be.revertedWith("Token not accepted");
    });

    it("Should allow payout of accepted tokens", async function () {
      const { vault, testToken, user } = await loadFixture(deployVaultFixture);
      const amount = BigInt(100);
      
      // First deposit some tokens
      await testToken.connect(user).approve(vault.target, amount);
      await vault.connect(user).deposit(testToken.target, amount);

      // Then payout
      const recipient = hre.ethers.Wallet.createRandom().address;
      await vault.payout(testToken.target, amount, recipient);
      
      expect(await testToken.balanceOf(recipient)).to.equal(amount);
    });

    it("Should not allow payout of non-accepted tokens", async function () {
      const { vault, user } = await loadFixture(deployVaultFixture);
      
      const NonAcceptedToken = await hre.ethers.getContractFactory("TestFT");
      const nonAcceptedToken = await NonAcceptedToken.deploy();
      
      await expect(
        vault.payout(nonAcceptedToken.target, BigInt(100), user.address)
      ).to.be.revertedWith("Token not accepted");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdrawal", async function () {
      const { vault, testToken, user, owner } = await loadFixture(deployVaultFixture);
      const amount = BigInt(100);
      
      // First deposit some tokens
      await testToken.connect(user).approve(vault.target, amount);
      await vault.connect(user).deposit(testToken.target, amount);

      // Emergency withdraw
      await vault.connect(owner).emergencyWithdraw(testToken.target, amount);
      
      expect(await testToken.balanceOf(owner.address)).to.equal(amount);
      expect(await testToken.balanceOf(vault.target)).to.equal(0);
    });
  });
});
