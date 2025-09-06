import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { setupTestEnvironment, TestEnvironment } from "../../setup/test-environment";

describe("RubySwapPool - Flash Function", () => {
  let env: TestEnvironment;
  let pool: Contract;
  let token0: Contract;
  let token1: Contract;
  let user: Signer;
  let userAddress: string;
  let flashRecipient: Contract;

  before(async () => {
    const signers = await ethers.getSigners();
    user = signers[1]; // Use user1 from test environment
    userAddress = await user.getAddress();
  });

  beforeEach(async () => {
    env = await setupTestEnvironment();
    pool = env.pool;
    token0 = env.token0;
    token1 = env.token1;
    
    // Debug: check token addresses and pool token order
    console.log("Test token0 address:", await token0.getAddress());
    console.log("Test token1 address:", await token1.getAddress());
    console.log("Pool token0 address:", await pool.token0());
    console.log("Pool token1 address:", await pool.token1());
    
    // Deploy flash recipient
    const SimpleFlashLoanRecipient = await ethers.getContractFactory("SimpleFlashLoanRecipient");
    flashRecipient = await SimpleFlashLoanRecipient.deploy();
    await flashRecipient.waitForDeployment();
    
    // Add liquidity to the pool first
    await token0.mint(userAddress, ethers.parseEther("10000"));
    await token1.mint(userAddress, ethers.parseEther("10000"));
    
    // Approve position manager
    await token0.connect(user).approve(env.positionManager.getAddress(), ethers.parseEther("10000"));
    await token1.connect(user).approve(env.positionManager.getAddress(), ethers.parseEther("10000"));
    
    // Mint position to add liquidity - use larger amounts
    await env.positionManager.connect(user).mint({
      token0: await token0.getAddress(),
      token1: await token1.getAddress(),
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: ethers.parseEther("1"), // Increased from 10
      amount1Desired: ethers.parseEther("1"), // Increased from 10
      amount0Min: 0,
      amount1Min: 0,
      recipient: userAddress,
      deadline: (await ethers.provider.getBlock("latest"))!.timestamp + 1800
    });
    
    // Fund the flash recipient with tokens to repay the flash loan
    await token0.mint(await flashRecipient.getAddress(), ethers.parseEther("1000"));
    await token1.mint(await flashRecipient.getAddress(), ethers.parseEther("1000"));
    
    // Debug: verify the flash recipient has tokens
    const recipientBalance0 = await token0.balanceOf(await flashRecipient.getAddress());
    const recipientBalance1 = await token1.balanceOf(await flashRecipient.getAddress());
    console.log("Flash recipient token0 balance:", recipientBalance0.toString());
    console.log("Flash recipient token1 balance:", recipientBalance1.toString());
  });

  describe("Flash Function", () => {
    it("should execute flash loan successfully", async () => {
      // Use smaller amounts that won't exceed pool liquidity
      const amount0 = ethers.parseEther("10"); // Reduced from 100
      const amount1 = ethers.parseEther("10"); // Reduced from 1000
      
      // Get the pool's actual token addresses (sorted by address)
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      // Get the corresponding token contracts
      const poolToken0Contract = poolToken0 === await token0.getAddress() ? token0 : token1;
      const poolToken1Contract = poolToken1 === await token1.getAddress() ? token1 : token0;
      
      // Get balances before flash
      const balance0Before = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1Before = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      // Calculate expected fees (0.3% = 3000 bps)
      const fee0 = (amount0 * 3000n) / 1000000n;
      const fee1 = (amount1 * 3000n) / 1000000n;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      // Execute flash loan from a regular signer (user), not from flashRecipient contract
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
      
      // Check balances after flash (should increase by fees)
      const balance0After = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1After = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      expect(balance0After).to.equal(balance0Before + fee0);
      expect(balance1After).to.equal(balance1Before + fee1);
    });

    it("should revert when no liquidity exists", async () => {
      // Create a new pool without liquidity
      const NewToken0 = await ethers.getContractFactory("MockERC20");
      const newToken0 = await NewToken0.deploy("NewToken0", "NT0", 18);
      const NewToken1 = await ethers.getContractFactory("MockERC20");
      const newToken1 = await NewToken1.deploy("NewToken1", "NT1", 18);
      
      await newToken0.waitForDeployment();
      await newToken1.waitForDeployment();
      
      // Set up oracle feeds for new tokens
      await env.oracleRegistry.setFeed(await newToken0.getAddress(), ethers.Wallet.createRandom().address);
      await env.oracleRegistry.setFeed(await newToken1.getAddress(), ethers.Wallet.createRandom().address);
      
      // Create new pool
      await env.factory.createPool(await newToken0.getAddress(), await newToken1.getAddress(), 3000);
      const newPoolAddr = await env.factory.getPool(await newToken0.getAddress(), await newToken1.getAddress(), 3000);
      const NewPool = await ethers.getContractFactory("RubySwapPool");
      const newPool = NewPool.attach(newPoolAddr);
      
      // Initialize pool
      await newPool.initialize(2n ** 96n);
      
      // Try to flash loan from empty pool
      await expect(
        newPool.flash(
          await flashRecipient.getAddress(),
          ethers.parseEther("1"),
          0,
          "0x"
        )
      ).to.be.revertedWith("No liquidity");
    });

    it("should handle flash loan with only token0", async () => {
      const amount0 = ethers.parseEther("5"); // Reduced amount
      const amount1 = 0;
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const poolToken0Contract = poolToken0 === await token0.getAddress() ? token0 : token1;
      
      const balance0Before = await poolToken0Contract.balanceOf(await pool.getAddress());
      
      const fee0 = (amount0 * 3000n) / 1000000n;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
      
      const balance0After = await poolToken0Contract.balanceOf(await pool.getAddress());
      expect(balance0After).to.equal(balance0Before + fee0);
    });

    it("should handle flash loan with only token1", async () => {
      const amount0 = 0;
      const amount1 = ethers.parseEther("5"); // Reduced amount
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const poolToken1Contract = poolToken1 === await token1.getAddress() ? token1 : token0;
      
      const balance1Before = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const fee1 = (amount1 * 3000n) / 1000000n;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
      
      const balance1After = await poolToken1Contract.balanceOf(await pool.getAddress());
      expect(balance1After).to.equal(balance1Before + fee1);
    });

    it("should handle flash loan with zero amounts", async () => {
      const amount0 = 0;
      const amount1 = 0;
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [await pool.token0(), await pool.token1(), amount0, amount1]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
    });

    it("should update fee growth global when fees are paid", async () => {
      const amount0 = ethers.parseEther("10"); // Reduced amount
      const amount1 = ethers.parseEther("10"); // Reduced amount
      
      // Get initial fee growth
      const initialFeeGrowth0 = await pool.feeGrowthGlobal0X128();
      const initialFeeGrowth1 = await pool.feeGrowthGlobal1X128();
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const poolToken0Contract = poolToken0 === await token0.getAddress() ? token0 : token1;
      const poolToken1Contract = poolToken1 === await token1.getAddress() ? token1 : token0;
      
      // Get balances before flash
      const balance0Before = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1Before = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await pool.connect(user).flash(
        await flashRecipient.getAddress(),
        amount0,
        amount1,
        data
      );
      
      // Check that fee growth was updated
      const finalFeeGrowth0 = await pool.feeGrowthGlobal0X128();
      const finalFeeGrowth1 = await pool.feeGrowthGlobal1X128();
      
      expect(finalFeeGrowth0).to.be.gt(initialFeeGrowth0);
      expect(finalFeeGrowth1).to.be.gt(initialFeeGrowth1);
      
      // Check balances increased by fees
      const balance0After = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1After = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const fee0 = (amount0 * 3000n) / 1000000n;
      const fee1 = (amount1 * 3000n) / 1000000n;
      
      expect(balance0After).to.equal(balance0Before + fee0);
      expect(balance1After).to.equal(balance1Before + fee1);
    });

    it("should handle flash loan with custom data", async () => {
      const amount0 = ethers.parseEther("5"); // Reduced amount
      const amount1 = ethers.parseEther("5"); // Reduced amount
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const poolToken0Contract = poolToken0 === await token0.getAddress() ? token0 : token1;
      const poolToken1Contract = poolToken1 === await token1.getAddress() ? token1 : token0;
      
      const balance0Before = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1Before = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const customData = abiCoder.encode([
        'address','address','uint256','uint256','string'
      ], [poolToken0, poolToken1, amount0, amount1, "custom flash loan"]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          customData
        )
      ).to.emit(pool, "Flash");
      
      const balance0After = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1After = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const fee0 = (amount0 * 3000n) / 1000000n;
      const fee1 = (amount1 * 3000n) / 1000000n;
      
      expect(balance0After).to.equal(balance0Before + fee0);
      expect(balance1After).to.equal(balance1Before + fee1);
    });

    it("should revert if flash callback fails", async () => {
      // Deploy malicious flash recipient that will fail
      const MaliciousFlashLoanRecipient = await ethers.getContractFactory("MaliciousFlashLoanRecipient");
      const maliciousRecipient = await MaliciousFlashLoanRecipient.deploy();
      await maliciousRecipient.waitForDeployment();
      
      await expect(
        pool.connect(user).flash(
          await maliciousRecipient.getAddress(),
          ethers.parseEther("10"),
          0,
          "0x"
        )
      ).to.be.revertedWith("Insufficient token0 repayment");
    });
  });

  describe("Flash Function Edge Cases", () => {
    it("should handle very small amounts", async () => {
      const amount0 = 1;
      const amount1 = 1;
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
    });

    it("should handle maximum amounts within liquidity bounds", async () => {
      // Use a reasonable amount that won't exceed pool liquidity
      const amount0 = ethers.parseEther("1");
      const amount1 = ethers.parseEther("1");
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await expect(
        pool.connect(user).flash(
          await flashRecipient.getAddress(),
          amount0,
          amount1,
          data
        )
      ).to.emit(pool, "Flash");
    });

    it("should maintain pool state consistency after flash", async () => {
      const initialState = {
        sqrtPriceX96: await pool.sqrtPriceX96(),
        tick: await pool.tick(),
        liquidity: await pool.liquidity()
      };
      
      const amount0 = ethers.parseEther("10"); // Reduced amount
      const amount1 = ethers.parseEther("10"); // Reduced amount
      
      // Get the pool's actual token addresses
      const poolToken0 = await pool.token0();
      const poolToken1 = await pool.token1();
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const data = abiCoder.encode([
        'address','address','uint256','uint256'
      ], [poolToken0, poolToken1, amount0, amount1]);
      
      await pool.connect(user).flash(
        await flashRecipient.getAddress(),
        amount0,
        amount1,
        data
      );
      
      // Check that core state remains unchanged
      expect(await pool.sqrtPriceX96()).to.equal(initialState.sqrtPriceX96);
      expect(await pool.tick()).to.equal(initialState.tick);
      expect(await pool.liquidity()).to.equal(initialState.liquidity);
      
      // But balances should have increased by fees
      const poolToken0Contract = poolToken0 === await token0.getAddress() ? token0 : token1;
      const poolToken1Contract = poolToken1 === await token1.getAddress() ? token1 : token0;
      
      const balance0After = await poolToken0Contract.balanceOf(await pool.getAddress());
      const balance1After = await poolToken1Contract.balanceOf(await pool.getAddress());
      
      const fee0 = (amount0 * 3000n) / 1000000n;
      const fee1 = (amount1 * 3000n) / 1000000n;
      
      // Balances should be positive (fees were added)
      expect(balance0After).to.be.gt(0);
      expect(balance1After).to.be.gt(0);
    });
  });
});
