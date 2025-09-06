import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { setupTestEnvironment, TestEnvironment } from "../../setup/test-environment";

describe("RubySwapPositionManager - Fee Functions", () => {
  let env: TestEnvironment;
  let positionManager: Contract;
  let token0: Contract;
  let token1: Contract;
  let user: Signer;
  let userAddress: string;
  let feeRecipient: Signer;
  let feeRecipientAddress: string;

  before(async () => {
    const signers = await ethers.getSigners();
    user = signers[1]; // Use user1 from test environment
    feeRecipient = signers[2]; // Use user2 from test environment
    userAddress = await user.getAddress();
    feeRecipientAddress = await feeRecipient.getAddress();
  });

  beforeEach(async () => {
    env = await setupTestEnvironment();
    positionManager = env.positionManager;
    token0 = env.token0;
    token1 = env.token1;
    
    // Mint some tokens to the position manager for testing
    await token0.mint(await positionManager.getAddress(), ethers.parseEther("1000"));
    await token1.mint(await positionManager.getAddress(), ethers.parseEther("1000"));
  });

  describe("sweepTokenWithFee", () => {
    it("should sweep token with fee when feeBips > 0", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 100; // 1%
      const balanceBefore = await token0.balanceOf(userAddress);
      
      // Execute sweepTokenWithFee
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await token0.balanceOf(userAddress);
      const feeRecipientBalance = await token0.balanceOf(feeRecipientAddress);
      
      // Check that user received tokens minus fee
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeRecipientBalance).to.be.gt(0);
    });

    it("should sweep token without fee when feeBips == 0", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 0;
      const balanceBefore = await token0.balanceOf(userAddress);
      const feeBefore = await token0.balanceOf(feeRecipientAddress);
      
      // Execute sweepTokenWithFee
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await token0.balanceOf(userAddress);
      const feeAfter = await token0.balanceOf(feeRecipientAddress);
      
      // Check that user received tokens and no fee was taken
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.equal(0n);
    });

    it("should sweep token without fee when feeRecipient is zero address", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 100;
      const balanceBefore = await token0.balanceOf(userAddress);
      const feeBefore = await token0.balanceOf(feeRecipientAddress);
      
      // Execute sweepTokenWithFee with zero address fee recipient
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        ethers.ZeroAddress
      );
      
      const balanceAfter = await token0.balanceOf(userAddress);
      const feeAfter = await token0.balanceOf(feeRecipientAddress);
      
      // Check that user received tokens and no fee was taken
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.equal(0n);
    });

    it("should handle very small fee amounts", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 1; // 0.01%
      const balanceBefore = await token0.balanceOf(userAddress);
      
      // Execute sweepTokenWithFee
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await token0.balanceOf(userAddress);
      const feeRecipientBalance = await token0.balanceOf(feeRecipientAddress);
      
      // Check that both user and fee recipient received tokens
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeRecipientBalance).to.be.gt(0);
    });

    it("should handle maximum fee amount", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 10000; // 100%
      const balanceBefore = await token0.balanceOf(userAddress);
      
      // Execute sweepTokenWithFee
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await token0.balanceOf(userAddress);
      const feeRecipientBalance = await token0.balanceOf(feeRecipientAddress);
      
      // Check that fee recipient got all tokens
      expect(balanceAfter).to.equal(balanceBefore);
      expect(feeRecipientBalance).to.be.gt(0);
    });

    it("should revert when amountMinimum is not met", async () => {
      const amountMinimum = ethers.parseEther("10000"); // More than available
      const feeBips = 100;
      
      await expect(
        positionManager.sweepTokenWithFee(
          await token0.getAddress(),
          amountMinimum,
          userAddress,
          feeBips,
          feeRecipientAddress
        )
      ).to.be.revertedWith("Insufficient token");
    });
  });

  describe("unwrapWETH9WithFee", () => {
    it("should unwrap WETH with fee when feeBips > 0", async () => {
      const wethAddr = await positionManager.WETH9();
      const weth = await ethers.getContractAt("MockWETH9", wethAddr);
      await weth.deposit({ value: ethers.parseEther("1000") });
      await weth.transfer(await positionManager.getAddress(), ethers.parseEther("1000"));

      const amountMinimum = ethers.parseEther("100");
      const feeBips = 100; // 1%
      const balanceBefore = await ethers.provider.getBalance(userAddress);
      const feeBefore = await ethers.provider.getBalance(feeRecipientAddress);
      
      await positionManager.unwrapWETH9WithFee(
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await ethers.provider.getBalance(userAddress);
      const feeAfter = await ethers.provider.getBalance(feeRecipientAddress);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.be.gt(0n);
    });

    it("should unwrap WETH without fee when feeBips == 0", async () => {
      const wethAddr = await positionManager.WETH9();
      const weth = await ethers.getContractAt("MockWETH9", wethAddr);
      await weth.deposit({ value: ethers.parseEther("1000") });
      await weth.transfer(await positionManager.getAddress(), ethers.parseEther("1000"));

      const amountMinimum = ethers.parseEther("100");
      const feeBips = 0;
      const balanceBefore = await ethers.provider.getBalance(userAddress);
      const feeBefore = await ethers.provider.getBalance(feeRecipientAddress);
      
      await positionManager.unwrapWETH9WithFee(
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await ethers.provider.getBalance(userAddress);
      const feeAfter = await ethers.provider.getBalance(feeRecipientAddress);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.equal(0n);
    });

    it("should unwrap WETH without fee when feeRecipient is zero address", async () => {
      const wethAddr = await positionManager.WETH9();
      const weth = await ethers.getContractAt("MockWETH9", wethAddr);
      await weth.deposit({ value: ethers.parseEther("1000") });
      await weth.transfer(await positionManager.getAddress(), ethers.parseEther("1000"));

      const amountMinimum = ethers.parseEther("100");
      const feeBips = 100;
      const balanceBefore = await ethers.provider.getBalance(userAddress);
      const feeBefore = await ethers.provider.getBalance(feeRecipientAddress);
      
      await positionManager.unwrapWETH9WithFee(
        amountMinimum,
        userAddress,
        feeBips,
        ethers.ZeroAddress
      );
      
      const balanceAfter = await ethers.provider.getBalance(userAddress);
      const feeAfter = await ethers.provider.getBalance(feeRecipientAddress);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.equal(0n);
    });

    it("should handle zero WETH balance", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 100;
      await expect(
        positionManager.unwrapWETH9WithFee(
          amountMinimum,
          userAddress,
          feeBips,
          feeRecipientAddress
        )
      ).to.be.revertedWith("Insufficient WETH9");
    });

    it("should handle very small fee amounts", async () => {
      const wethAddr = await positionManager.WETH9();
      const weth = await ethers.getContractAt("MockWETH9", wethAddr);
      await weth.deposit({ value: ethers.parseEther("1000") });
      await weth.transfer(await positionManager.getAddress(), ethers.parseEther("1000"));

      const amountMinimum = ethers.parseEther("100");
      const feeBips = 1; // 0.01%
      const balanceBefore = await ethers.provider.getBalance(userAddress);
      const feeBefore = await ethers.provider.getBalance(feeRecipientAddress);
      
      await positionManager.unwrapWETH9WithFee(
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await ethers.provider.getBalance(userAddress);
      const feeAfter = await ethers.provider.getBalance(feeRecipientAddress);
      
      expect(balanceAfter).to.be.gt(balanceBefore);
      expect(feeAfter - feeBefore).to.be.gt(0n);
    });

    it("should handle maximum fee amount", async () => {
      const wethAddr = await positionManager.WETH9();
      const weth = await ethers.getContractAt("MockWETH9", wethAddr);
      await weth.deposit({ value: ethers.parseEther("1000") });
      await weth.transfer(await positionManager.getAddress(), ethers.parseEther("1000"));

      const amountMinimum = ethers.parseEther("100");
      const feeBips = 10000; // 100%
      const balanceBefore = await ethers.provider.getBalance(userAddress);
      const feeBefore = await ethers.provider.getBalance(feeRecipientAddress);
      
      await positionManager.unwrapWETH9WithFee(
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      const balanceAfter = await ethers.provider.getBalance(userAddress);
      const feeAfter = await ethers.provider.getBalance(feeRecipientAddress);
      
      expect(balanceAfter).to.equal(balanceBefore);
      expect(feeAfter - feeBefore).to.be.gt(0n);
    });

    it("should revert when amountMinimum is not met", async () => {
      const amountMinimum = ethers.parseEther("10000"); // More than available
      const feeBips = 100;
      await expect(
        positionManager.unwrapWETH9WithFee(
          amountMinimum,
          userAddress,
          feeBips,
          feeRecipientAddress
        )
      ).to.be.revertedWith("Insufficient WETH9");
    });
  });

  describe("Edge Cases", () => {
    it("should handle fee calculation with very small amounts", async () => {
      const amountMinimum = 1;
      const feeBips = 100; // 1%
      
      // Execute sweepTokenWithFee with very small amount
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      // Should not revert
      expect(true).to.be.true;
    });

    it("should handle fee calculation with odd fee percentages", async () => {
      const amountMinimum = ethers.parseEther("100");
      const feeBips = 333; // 3.33%
      
      // Execute sweepTokenWithFee with odd fee percentage
      await positionManager.sweepTokenWithFee(
        await token0.getAddress(),
        amountMinimum,
        userAddress,
        feeBips,
        feeRecipientAddress
      );
      
      // Should not revert
      expect(true).to.be.true;
    });
  });
}); 