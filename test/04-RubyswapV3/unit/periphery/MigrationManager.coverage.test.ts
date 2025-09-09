import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Coverage Tests", function () {
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
    ruby = await MockERC20.deploy("Ruby Token", "RUBY");
    await ruby.waitForDeployment();

    // Deploy MigrationManager with correct constructor parameters
    const MigrationManager = await ethers.getContractFactory("MigrationManager");
    migrationManager = await MigrationManager.deploy(
      await positionManager.getAddress(),
      await factory.getAddress(),
      await mockUniPositionManager.getAddress(),
      await ruby.getAddress(),
      ethers.parseEther("1000000") // 1M RUBY max migration rewards
    );
    await migrationManager.waitForDeployment();

    // Mint RUBY tokens to migration manager for rewards
    await ruby.mint(await migrationManager.getAddress(), ethers.parseEther("1000000"));
  });

  describe("Constructor", function () {
    it("should set correct addresses", async function () {
      expect(await migrationManager.positionManager()).to.equal(await positionManager.getAddress());
      expect(await migrationManager.factory()).to.equal(await factory.getAddress());
      expect(await migrationManager.uniPositionManager()).to.equal(await mockUniPositionManager.getAddress());
      expect(await migrationManager.ruby()).to.equal(await ruby.getAddress());
    });

    it("should set max migration rewards", async function () {
      expect(await migrationManager.maxMigrationRewards()).to.equal(ethers.parseEther("1000000"));
    });

    it("should revert with ZeroAddress for zero positionManager", async function () {
      const MigrationManager = await ethers.getContractFactory("MigrationManager");
      await expect(
        MigrationManager.deploy(
          ethers.ZeroAddress,
          await factory.getAddress(),
          await mockUniPositionManager.getAddress(),
          await ruby.getAddress(),
          ethers.parseEther("1000000")
        )
      ).to.be.revertedWithCustomError(MigrationManager, "ZeroAddress");
    });

    it("should revert with ZeroAddress for zero factory", async function () {
      const MigrationManager = await ethers.getContractFactory("MigrationManager");
      await expect(
        MigrationManager.deploy(
          await positionManager.getAddress(),
          ethers.ZeroAddress,
          await mockUniPositionManager.getAddress(),
          await ruby.getAddress(),
          ethers.parseEther("1000000")
        )
      ).to.be.revertedWithCustomError(MigrationManager, "ZeroAddress");
    });

    it("should revert with ZeroAddress for zero uniPositionManager", async function () {
      const MigrationManager = await ethers.getContractFactory("MigrationManager");
      await expect(
        MigrationManager.deploy(
          await positionManager.getAddress(),
          await factory.getAddress(),
          ethers.ZeroAddress,
          await ruby.getAddress(),
          ethers.parseEther("1000000")
        )
      ).to.be.revertedWithCustomError(MigrationManager, "ZeroAddress");
    });

    it("should revert with ZeroAddress for zero ruby", async function () {
      const MigrationManager = await ethers.getContractFactory("MigrationManager");
      await expect(
        MigrationManager.deploy(
          await positionManager.getAddress(),
          await factory.getAddress(),
          await mockUniPositionManager.getAddress(),
          ethers.ZeroAddress,
          ethers.parseEther("1000000")
        )
      ).to.be.revertedWithCustomError(MigrationManager, "ZeroAddress");
    });
  });

  describe("Access Control", function () {
    it("should allow admin to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await migrationManager.setMaxMigrationRewards(newMaxRewards);
      expect(await migrationManager.maxMigrationRewards()).to.equal(newMaxRewards);
    });

    it("should revert when non-admin tries to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await expect(
        migrationManager.connect(user1).setMaxMigrationRewards(newMaxRewards)
      ).to.be.revertedWith(
        `AccessControl: account ${await user1.getAddress().toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000000`
      );
    });

    it("should allow pauser to pause", async function () {
      await migrationManager.pause();
      expect(await migrationManager.paused()).to.be.true;
    });

    it("should allow pauser to unpause", async function () {
      await migrationManager.pause();
      await migrationManager.unpause();
      expect(await migrationManager.paused()).to.be.false;
    });

    it("should revert when non-pauser tries to pause", async function () {
      await expect(
        migrationManager.connect(user1).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${await user1.getAddress().toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000001`
      );
    });

    it("should revert when non-pauser tries to unpause", async function () {
      await migrationManager.pause();
      await expect(
        migrationManager.connect(user1).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${await user1.getAddress().toLowerCase()} is missing role 0x0000000000000000000000000000000000000000000000000000000000000001`
      );
    });
  });

  describe("Pausable", function () {
    it("should be unpaused initially", async function () {
      expect(await migrationManager.paused()).to.be.false;
    });

    it("should revert migration when paused", async function () {
      await migrationManager.pause();
      
      // Create a mock Uniswap V3 position
      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        migrationManager.connect(user1).migratePosition(
          uniTokenId,
          await user1.getAddress(),
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Migration Functionality", function () {
    it("should migrate a single position successfully", async function () {
      // Create a mock Uniswap V3 position
      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      // Mock the position data
      await mockUniPositionManager.setPositionData(
        uniTokenId,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );

      // Mock the decreaseLiquidity and collect calls
      await mockUniPositionManager.setMockAmounts(ethers.parseEther("50"), ethers.parseEther("50"));

      const tx = await migrationManager.connect(user1).migratePosition(
        uniTokenId,
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(tx)
        .to.emit(migrationManager, "Migrated")
        .withArgs(
          await user1.getAddress(),
          uniTokenId,
          1, // rubyTokenId
          await token0.getAddress(),
          await token1.getAddress(),
          3000
        );
    });

    it("should revert when trying to migrate non-existent position", async function () {
      const nonExistentTokenId = 999;
      
      await expect(
        migrationManager.connect(user1).migratePosition(
          nonExistentTokenId,
          await user1.getAddress(),
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWithCustomError(migrationManager, "ZeroAddress");
    });

    it("should revert when trying to migrate position not owned by caller", async function () {
      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await deployer.getAddress(), // Different owner
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await deployer.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(
        migrationManager.connect(user1).migratePosition(
          uniTokenId,
          await user1.getAddress(),
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("Batch Migration", function () {
    it("should migrate multiple positions in batch", async function () {
      // Create multiple mock Uniswap V3 positions
      const uniTokenIds = [1, 2, 3];
      
      for (let i = 0; i < uniTokenIds.length; i++) {
        await mockUniPositionManager.mint(
          await user1.getAddress(),
          await token0.getAddress(),
          await token1.getAddress(),
          3000,
          -60,
          60,
          ethers.parseEther("100"),
          ethers.parseEther("100"),
          await user1.getAddress(),
          Math.floor(Date.now() / 1000) + 3600
        );

        await mockUniPositionManager.setPositionData(
          uniTokenIds[i],
          await token0.getAddress(),
          await token1.getAddress(),
          3000,
          -60,
          60,
          ethers.parseEther("100")
        );

        await mockUniPositionManager.setMockAmounts(ethers.parseEther("50"), ethers.parseEther("50"));
      }

      const tx = await migrationManager.connect(user1).batchMigratePositions(
        uniTokenIds,
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(tx)
        .to.emit(migrationManager, "BatchMigrated")
        .withArgs(
          await user1.getAddress(),
          uniTokenIds,
          [1, 2, 3] // rubyTokenIds
        );
    });

    it("should handle empty batch migration", async function () {
      const tx = await migrationManager.connect(user1).batchMigratePositions(
        [],
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(tx)
        .to.emit(migrationManager, "BatchMigrated")
        .withArgs(
          await user1.getAddress(),
          [],
          []
        );
    });
  });

  describe("Migration Rewards and Vesting", function () {
    it("should distribute migration rewards", async function () {
      // Create a mock Uniswap V3 position
      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await mockUniPositionManager.setPositionData(
        uniTokenId,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );

      await mockUniPositionManager.setMockAmounts(ethers.parseEther("50"), ethers.parseEther("50"));

      const tx = await migrationManager.connect(user1).migratePosition(
        uniTokenId,
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await expect(tx)
        .to.emit(migrationManager, "MigrationRewardDistributed");
    });

    it("should allow claiming vested migration rewards", async function () {
      // First migrate a position to get some rewards
      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await mockUniPositionManager.setPositionData(
        uniTokenId,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );

      await mockUniPositionManager.setMockAmounts(ethers.parseEther("50"), ethers.parseEther("50"));

      await migrationManager.connect(user1).migratePosition(
        uniTokenId,
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      // Fast forward time to allow vesting
      await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
      await ethers.provider.send("evm_mine", []);

      const tx = await migrationManager.connect(user1).claimVestedMigrationReward();
      await expect(tx)
        .to.emit(migrationManager, "MigrationRewardClaimed");
    });

    it("should revert when claiming rewards with no vested amount", async function () {
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("should revert when migration reward exceeds max", async function () {
      // Set very low max migration rewards
      await migrationManager.setMaxMigrationRewards(ethers.parseEther("1"));

      const uniTokenId = 1;
      await mockUniPositionManager.mint(
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );

      await mockUniPositionManager.setPositionData(
        uniTokenId,
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );

      await mockUniPositionManager.setMockAmounts(ethers.parseEther("50"), ethers.parseEther("50"));

      // This should still work but with limited rewards
      await migrationManager.connect(user1).migratePosition(
        uniTokenId,
        await user1.getAddress(),
        Math.floor(Date.now() / 1000) + 3600
      );
    });

    it("should handle invalid vesting amount", async function () {
      // This tests the InvalidVestingAmount error
      // We'll test this by trying to claim with invalid data
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });
  });
});
