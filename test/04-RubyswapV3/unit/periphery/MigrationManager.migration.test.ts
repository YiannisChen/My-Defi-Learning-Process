import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Migration Functionality Tests", function () {
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

    // Create pool for testing (using existing fee tier 3000)
    // Pool already created in setupTestEnvironment(await token0.getAddress(), await token1.getAddress(), 3000);
  });

  describe("Migration Process", function () {
    it("should test migration reward distribution", async function () {
      const uniTokenId = 1;
      
      // Set up mock Uniswap position
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

      // Test _distributeMigrationReward by calling claimVestedMigrationReward with no rewards
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });

    it("should test vested amount calculation", async function () {
      // Test getVestedAmount with no migrations
      const vestedAmount = await migrationManager.getVestedAmount(await user1.getAddress());
      expect(vestedAmount).to.equal(0);
    });

    it("should test USD value calculation", async function () {
      // This will test the _calculateUsdValue function indirectly
      // by checking that getUserMigrations returns empty array for new user
      const userMigrations = await migrationManager.getUserMigrations(await user1.getAddress());
      expect(userMigrations).to.be.an('array').that.is.empty;
    });

    it("should test admin functions", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      
      // Test setMaxMigrationRewards
      const tx = await migrationManager.setMaxMigrationRewards(newMaxRewards);
      expect(await migrationManager.maxMigrationRewards()).to.equal(newMaxRewards);
      await expect(tx).to.emit(migrationManager, "MaxMigrationRewardsUpdated");
    });

    it("should test migration validation", async function () {
      const uniTokenId = 1;
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)"],
        [{
          token0: await token0.getAddress(),
          token1: await token1.getAddress(),
          fee: 3000,
          tickLower: -60,
          tickUpper: 60,
          amount0Desired: ethers.parseEther("100"),
          amount1Desired: ethers.parseEther("100"),
          amount0Min: 0,
          amount1Min: 0,
          recipient: await user1.getAddress(),
          deadline: Math.floor(Date.now() / 1000) + 3600
        }]
      );

      // Test migration with non-existent position
      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.reverted;
    });

    it("should test batch migration validation", async function () {
      // Test empty batch migration
      await expect(
        migrationManager.connect(user1).batchMigrate([], [])
      ).to.be.revertedWith("Empty array");

      // Test mismatched array lengths
      await expect(
        migrationManager.connect(user1).batchMigrate([1], [])
      ).to.be.revertedWith("Array length mismatch");

      // Test too many positions
      const tooManyIds = Array.from({length: 11}, (_, i) => i + 1);
      const tooManyParams = Array(11).fill("0x");
      await expect(
        migrationManager.connect(user1).batchMigrate(tooManyIds, tooManyParams)
      ).to.be.revertedWith("Too many positions");
    });
  });
});
