import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Final Coverage Tests", function () {
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
      ethers.parseEther("1000000")
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
        `AccessControl: account ${await user1.getAddress().then(addr => addr.toLowerCase())} is missing role 0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775`
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
        `AccessControl: account ${await user1.getAddress().then(addr => addr.toLowerCase())} is missing role 0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a`
      );
    });

    it("should revert when non-pauser tries to unpause", async function () {
      await migrationManager.pause();
      await expect(
        migrationManager.connect(user1).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${await user1.getAddress().then(addr => addr.toLowerCase())} is missing role 0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a`
      );
    });
  });

  describe("Pausable", function () {
    it("should be unpaused initially", async function () {
      expect(await migrationManager.paused()).to.be.false;
    });

    it("should revert migration when paused", async function () {
      await migrationManager.pause();
      
      // Test that migration is blocked when paused
      const uniTokenId = 1;
      const rubyMintParams = "0x"; // Empty params for testing
      
      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Migration Functionality", function () {
    it("should revert when trying to migrate non-existent position", async function () {
      const nonExistentTokenId = 999;
      const rubyMintParams = "0x"; // Empty params for testing
      
      await expect(
        migrationManager.connect(user1).migrate(nonExistentTokenId, rubyMintParams)
      ).to.be.reverted;
    });

    it("should revert when trying to migrate position not owned by caller", async function () {
      const uniTokenId = 1;
      const rubyMintParams = "0x"; // Empty params for testing
      
      // Mock the position with different owner
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await deployer.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );
      
      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.reverted;
    });
  });

  describe("Batch Migration", function () {
    it("should revert when trying to migrate empty batch", async function () {
      const uniTokenIds: number[] = [];
      const rubyMintParamsArray: string[] = [];
      
      await expect(
        migrationManager.connect(user1).batchMigrate(uniTokenIds, rubyMintParamsArray)
      ).to.be.revertedWith("Empty array");
    });
  });

  describe("Migration Rewards and Vesting", function () {
    it("should revert when claiming rewards with no vested amount", async function () {
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });

    it("should return empty array for user migrations when none exist", async function () {
      const userMigrations = await migrationManager.getUserMigrations(await user1.getAddress());
      expect(userMigrations).to.be.an('array').that.is.empty;
    });

    it("should return zero for vested amount when none exists", async function () {
      const vestedAmount = await migrationManager.getVestedAmount(await user1.getAddress());
      expect(vestedAmount).to.equal(0);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it.skip("should handle migration reward exceeding max", async function () {
      // Set very low max migration rewards
      await migrationManager.setMaxMigrationRewards(ethers.parseEther("1"));
      
      // This should still work but with limited rewards
      const uniTokenId = 1;
      const rubyMintParams = "0x"; // Empty params for testing
      
      // Mock the position with correct owner
      await mockUniPositionManager.setPosition(
        uniTokenId,
        await user1.getAddress(),
        await token0.getAddress(),
        await token1.getAddress(),
        3000,
        -60,
        60,
        ethers.parseEther("100")
      );
      
      // This should work but with limited rewards
      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);
    });
  });
});
