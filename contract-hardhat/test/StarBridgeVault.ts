import {
  loadFixture,
  setBalance
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

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

    it("Should initialize with native token (address(0)) as accepted", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      expect(await vault.isTokenAccepted(hre.ethers.ZeroAddress)).to.be.true;
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
    describe("ERC20 Tokens", function () {
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
        ).to.be.revertedWithCustomError(vault, "TokenNotAccepted");
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
        ).to.be.revertedWithCustomError(vault, "TokenNotAccepted");
      });
    });

    describe("Native Token", function () {
      it("Should allow deposit of native token", async function () {
        const { vault, user } = await loadFixture(deployVaultFixture);
        const amount = parseEther("1.0");
        
        const initialBalance = await hre.ethers.provider.getBalance(vault.target);
        
        await vault.connect(user).deposit(hre.ethers.ZeroAddress, 0, { value: amount });
        
        expect(await hre.ethers.provider.getBalance(vault.target))
          .to.equal(initialBalance + amount);
      });

      it("Should allow payout of native token", async function () {
        const { vault, owner } = await loadFixture(deployVaultFixture);
        const amount = parseEther("1.0");
        
        // First deposit some native token
        await vault.deposit(hre.ethers.ZeroAddress, 0, { value: amount });
        
        const recipient = hre.ethers.Wallet.createRandom().address;
        const initialBalance = await hre.ethers.provider.getBalance(recipient);
        
        await vault.payout(hre.ethers.ZeroAddress, amount, recipient);
        
        expect(await hre.ethers.provider.getBalance(recipient))
          .to.equal(initialBalance + amount);
      });

      it("Should revert payout if native token balance is insufficient", async function () {
        const { vault } = await loadFixture(deployVaultFixture);
        const amount = parseEther("1.0");
        
        const recipient = hre.ethers.Wallet.createRandom().address;
        
        await expect(
          vault.payout(hre.ethers.ZeroAddress, amount, recipient)
        ).to.be.revertedWithCustomError(vault, "NotEnoughNativeBalance");
      });

      it("Should receive native token through receive function", async function () {
        const { vault, user } = await loadFixture(deployVaultFixture);
        const amount = parseEther("1.0");
        
        const initialBalance = await hre.ethers.provider.getBalance(vault.target);
        
        await user.sendTransaction({
          to: vault.target,
          value: amount
        });
        
        expect(await hre.ethers.provider.getBalance(vault.target))
          .to.equal(initialBalance + amount);
      });
    });
  });

  describe("Error Cases", function () {
    it("Should revert ERC20 payout if token balance is insufficient", async function () {
      const { vault, testToken, user } = await loadFixture(deployVaultFixture);
      const amount = BigInt(1000000); // More than available
      
      await expect(
        vault.payout(testToken.target, amount, user.address)
      ).to.be.revertedWithCustomError(vault, "NotEnoughTokenBalance");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdrawal of ERC20 tokens", async function () {
      const { vault, testToken, user, owner } = await loadFixture(deployVaultFixture);
      const amount = BigInt(100);
      
      await testToken.connect(user).approve(vault.target, amount);
      await vault.connect(user).deposit(testToken.target, amount);

      await vault.connect(owner).emergencyWithdraw(testToken.target);
      
      expect(await testToken.balanceOf(owner.address)).to.equal(amount);
      expect(await testToken.balanceOf(vault.target)).to.equal(0);
    });

    it("Should allow emergency withdrawal of native token", async function () {
      const { vault, owner } = await loadFixture(deployVaultFixture);
      const amount = parseEther("1.0");
      
      await vault.deposit(hre.ethers.ZeroAddress, 0, { value: amount });
      
      const initialBalance = await hre.ethers.provider.getBalance(owner.address);
      
      await vault.connect(owner).emergencyWithdraw(hre.ethers.ZeroAddress);
      
      expect(await hre.ethers.provider.getBalance(owner.address)).to.be.greaterThan(initialBalance);
    });
  });
});

