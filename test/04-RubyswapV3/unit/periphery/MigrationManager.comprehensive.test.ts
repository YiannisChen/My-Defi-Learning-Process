import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Comprehensive Migration Tests", function () {
  let migrationManager: any;
  let positionManager: any;
  let factory: any;
  let ruby: any;
  let deployer: any;
  let user1: any;
  let token0: any;
  let token1: any;
  let mockUniPositionManager: any;

  beforeEach(async function () {
    const env = await setupTestEnvironment();
    ({ deployer, user1, token0, token1, positionManager, factory } = env);

    // Deploy mock Uniswap V3 Position Manager
    const MockUniPositionManager = await ethers.getContractFactory("MockUniPositionManager");
    mockUniPositionManager = await MockUniPositionManager.deploy();
    await mockUniPositionManager.waitForDeployment();

    // Deploy RUBY token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ruby = await MockERC20.deploy("Ruby Token", "RUBY", 18);
    await ruby.waitForDeployment();

    // Deploy MigrationManager
    const MigrationManager = await ethers.getContractFactory("MigrationManager");
    migrationManager = await MigrationManager.deploy(
      await positionManager.getAddress(),
      await factory.getAddress(),
      await mockUniPositionManager.getAddress(),
      await ruby.getAddress(),
      ethers.parseEther("1000000") // 1M RUBY max migration rewards
    );
    await migrationManager.waitForDeployment();

    // Mint some RUBY to MigrationManager for rewards
    await ruby.mint(await migrationManager.getAddress(), ethers.parseEther("100000"));
  });

  describe("Migration Process", function () {
    it("should successfully migrate a position", async function () {
      // Setup Uniswap V3 position
      const uniTokenId = 1;
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        100000000000000000000n
      );

      // Create mint parameters for RubySwap
      const mintParams = {
        token0: await token0.getAddress(),
        token1: await token1.getAddress(),
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: 100000000000000000000n,
        amount1Desired: 100000000000000000000n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await user1.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600
      };

      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [mintParams]
      );

      // Execute migration
      const tx = await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);
      const receipt = await tx.wait();

      // Check events
      const migratedEvent = receipt.logs.find(log => {
        try {
          const decoded = migrationManager.interface.parseLog(log);
          return decoded?.name === "Migrated";
        } catch {
          return false;
        }
      });

      expect(migratedEvent).to.not.be.undefined;
    });

    it("should handle batch migration", async function () {
      // Setup multiple Uniswap V3 positions
      const uniTokenIds = [1, 2, 3];
      const rubyMintParamsArray = [];

      for (let i = 0; i < uniTokenIds.length; i++) {
        await mockUniPositionManager.setPosition(
          uniTokenIds[i],
          await user1.getAddress(),
          await token0.getAddress(),
          await token1.getAddress(),
          3000,
          -60,
          60,
          100000000000000000000n
        );

        const mintParams = {
          token0: await token0.getAddress(),
          token1: await token1.getAddress(),
          fee: 3000,
          tickLower: -60,
          tickUpper: 60,
          amount0Desired: 100000000000000000000n,
          amount1Desired: 100000000000000000000n,
          amount0Min: 0,
          amount1Min: 0,
          recipient: await user1.getAddress(),
          deadline: Math.floor(Date.now() / 1000) + 3600
        };

        const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [mintParams]
        );
        rubyMintParamsArray.push(rubyMintParams);
      }

      // Execute batch migration
      const tx = await migrationManager.connect(user1).batchMigrate(uniTokenIds, rubyMintParamsArray);
      const receipt = await tx.wait();

      // Check batch migrated event
      const batchMigratedEvent = receipt.logs.find(log => {
        try {
          const decoded = migrationManager.interface.parseLog(log);
          return decoded?.name === "BatchMigrated";
        } catch {
          return false;
        }
      });

      expect(batchMigratedEvent).to.not.be.undefined;
    });

    it("should revert when trying to migrate already migrated position", async function () {
      const uniTokenId = 1;
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        100000000000000000000n
      );

      const mintParams = {
        token0: await token0.getAddress(),
        token1: await token1.getAddress(),
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: 100000000000000000000n,
        amount1Desired: 100000000000000000000n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await user1.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600
      };

      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [mintParams]
      );

      // First migration should succeed
      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);

      // Second migration should revert
      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWithCustomError(migrationManager, "AlreadyMigrated");
    });

    it("should revert when pool does not exist", async function () {
      const uniTokenId = 1;
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        500, // Fee tier that doesn't exist
        -60,
        60,
        100000000000000000000n
      );

      const mintParams = {
        token0: await token0.getAddress(),
        token1: await token1.getAddress(),
        fee: 500, // Non-existent fee tier
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: 100000000000000000000n,
        amount1Desired: 100000000000000000000n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await user1.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600
      };

      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [mintParams]
      );

      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWith("POOL_NOT_FOUND");
    });
  });

  describe("Migration Rewards", function () {
    it("should distribute migration rewards", async function () {
      const uniTokenId = 1;
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        100000000000000000000n
      );

      const mintParams = {
        token0: await token0.getAddress(),
        token1: await token1.getAddress(),
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: 100000000000000000000n,
        amount1Desired: 100000000000000000000n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await user1.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600
      };

      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [mintParams]
      );

      const initialBalance = await ruby.balanceOf(await user1.getAddress());

      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);

      const finalBalance = await ruby.balanceOf(await user1.getAddress());
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("should handle migration reward vesting", async function () {
      // This test would require more complex setup for vesting
      // For now, just test that the function exists and can be called
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });
  });

  describe("Admin Functions", function () {
    it("should allow admin to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await migrationManager.connect(deployer).setMaxMigrationRewards(newMaxRewards);
      
      const maxRewards = await migrationManager.maxMigrationRewards();
      expect(maxRewards).to.equal(newMaxRewards);
    });

    it("should revert when non-admin tries to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await expect(
        migrationManager.connect(user1).setMaxMigrationRewards(newMaxRewards)
      ).to.be.revertedWithCustomError(migrationManager, "AccessControl");
    });
  });

  describe("Pausable Functionality", function () {
    it("should pause and unpause migration", async function () {
      await migrationManager.connect(deployer).pause();
      
      const uniTokenId = 1;
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        100000000000000000000n
      );

      const mintParams = {
        token0: await token0.getAddress(),
        token1: await token1.getAddress(),
        fee: 3000,
        tickLower: -60,
        tickUpper: 60,
        amount0Desired: 100000000000000000000n,
        amount1Desired: 100000000000000000000n,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await user1.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600
      };

      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [mintParams]
      );

      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWithCustomError(migrationManager, "EnforcedPause");

      await migrationManager.connect(deployer).unpause();
      
      // Should work after unpause
      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);
    });
  });
});
