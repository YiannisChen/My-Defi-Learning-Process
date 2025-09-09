import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Enhanced Tests", function () {
  let migrationManager: any;
  let positionManager: any;
  let factory: any;
  let ruby: any;
  let deployer: any;
  let user1: any;
  let user2: any;
  let token0: any;
  let token1: any;
  let mockUniPositionManager: any;

  beforeEach(async function () {
    const env = await setupTestEnvironment();
    ({ deployer, user1, user2, token0, token1, positionManager, factory } = env);

    // Deploy mock Uniswap V3 Position Manager
    const MockUniPositionManager = await ethers.getContractFactory("MockUniPositionManager");
    mockUniPositionManager = await MockUniPositionManager.deploy();
    await mockUniPositionManager.waitForDeployment();

    // Deploy RUBY token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
    await ruby.waitForDeployment();

    // Deploy MigrationManager
    const MigrationManagerFactory = await ethers.getContractFactory("MigrationManager");
    migrationManager = await MigrationManagerFactory.deploy(
      await positionManager.getAddress(),
      await factory.getAddress(),
      await mockUniPositionManager.getAddress(),
      await ruby.getAddress(),
      ethers.parseEther("1000000") // 1M RUBY max migration rewards
    );
    await migrationManager.waitForDeployment();

    // Fund migration manager with RUBY for rewards
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
      const MigrationManagerFactory = await ethers.getContractFactory("MigrationManager");
      await expect(
        MigrationManagerFactory.deploy(
          ethers.ZeroAddress,
          await factory.getAddress(),
          await mockUniPositionManager.getAddress(),
          await ruby.getAddress(),
          ethers.parseEther("1000000")
        )
      ).to.be.revertedWithCustomError(migrationManager, "ZeroAddress");
    });
  });

  describe("Migration Functionality", function () {
    beforeEach(async function () {
      // Setup mock Uniswap V3 position
      await mockUniPositionManager.setPosition(
        1, // uniTokenId
        user1.address, // owner
        await token0.getAddress(), // token0
        await token1.getAddress(), // token1
        3000, // fee
        -60, // tickLower
        60, // tickUpper
        ethers.parseEther("100") // liquidity
      );

      // Setup RubySwap pool
      const fee = 3000;
      const tickSpacing = 60;
      await factory.connect(deployer).enableFeeAmount(fee, tickSpacing);
      const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), fee);
      if (poolAddress === ethers.ZeroAddress) {
        await factory.connect(deployer).createPool(await token0.getAddress(), await token1.getAddress(), fee);
      }
    });

    it("should migrate a single position successfully", async function () {
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      const tx = await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);
      const receipt = await tx.wait();

      // Check events
      const migratedEvent = receipt!.logs.find((l: any) => l.fragment?.name === "Migrated");
      expect(migratedEvent).to.not.be.undefined;

      // Check that position is marked as migrated
      expect(await migrationManager.migratedUniTokens(uniTokenId)).to.be.true;

      // Check user migrations
      const userMigrations = await migrationManager.getUserMigrations(user1.address);
      expect(userMigrations).to.include(uniTokenId);
    });

    it("should revert when trying to migrate already migrated position", async function () {
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      // First migration should succeed
      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);

      // Second migration should revert
      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWithCustomError(migrationManager, "AlreadyMigrated");
    });

    it("should revert when recipient is not caller", async function () {
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          deployer.address, // Different recipient
          deadline
        ]]
      );

      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWith("RECIPIENT_MUST_CALLER");
    });

    it("should revert when pool does not exist", async function () {
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          10000, // Different fee tier that doesn't exist
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWith("POOL_NOT_FOUND");
    });
  });

  describe("Batch Migration", function () {
    beforeEach(async function () {
      // Setup multiple mock Uniswap V3 positions
      for (let i = 1; i <= 3; i++) {
        await mockUniPositionManager.setPosition(
          i,
          user1.address,
          await token0.getAddress(),
          await token1.getAddress(),
          3000,
          -60,
          60,
          ethers.parseEther("100")
        );
      }

      // Setup RubySwap pool
      const fee = 3000;
      const tickSpacing = 60;
      await factory.connect(deployer).enableFeeAmount(fee, tickSpacing);
      const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), fee);
      if (poolAddress === ethers.ZeroAddress) {
        await factory.connect(deployer).createPool(await token0.getAddress(), await token1.getAddress(), fee);
      }
    });

    it("should migrate multiple positions in batch", async function () {
      const uniTokenIds = [1, 2, 3];
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParamsArray = [
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [[
            token0Addr,
            token1Addr,
            3000,
            -60,
            60,
            ethers.parseEther("10"),
            ethers.parseEther("10"),
            0,
            0,
            user1.address,
            deadline
          ]]
        ),
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [[
            token0Addr,
            token1Addr,
            3000,
            -60,
            60,
            ethers.parseEther("10"),
            ethers.parseEther("10"),
            0,
            0,
            user1.address,
            deadline
          ]]
        ),
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [[
            token0Addr,
            token1Addr,
            3000,
            -60,
            60,
            ethers.parseEther("10"),
            ethers.parseEther("10"),
            0,
            0,
            user1.address,
            deadline
          ]]
        )
      ];

      const tx = await migrationManager.connect(user1).batchMigrate(uniTokenIds, rubyMintParamsArray);
      const receipt = await tx.wait();

      // Check events
      const batchMigratedEvent = receipt!.logs.find((l: any) => l.fragment?.name === "BatchMigrated");
      expect(batchMigratedEvent).to.not.be.undefined;

      // Check that all positions are marked as migrated
      for (const uniTokenId of uniTokenIds) {
        expect(await migrationManager.migratedUniTokens(uniTokenId)).to.be.true;
      }

      // Check user migrations
      const userMigrations = await migrationManager.getUserMigrations(user1.address);
      expect(userMigrations).to.have.length(3);
    });

    it("should revert when array lengths don't match", async function () {
      const uniTokenIds = [1, 2];
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParamsArray = [
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [[
            token0Addr,
            token1Addr,
            3000,
            -60,
            60,
            ethers.parseEther("10"),
            ethers.parseEther("10"),
            0,
            0,
            user1.address,
            deadline
          ]]
        )
        // Missing second element
      ];

      await expect(
        migrationManager.connect(user1).batchMigrate(uniTokenIds, rubyMintParamsArray)
      ).to.be.revertedWith("Array length mismatch");
    });

    it("should revert when array is empty", async function () {
      await expect(
        migrationManager.connect(user1).batchMigrate([], [])
      ).to.be.revertedWith("Empty array");
    });

    it("should revert when too many positions", async function () {
      const uniTokenIds = Array.from({ length: 11 }, (_, i) => i + 1);
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParamsArray = Array.from({ length: 11 }, () => 
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
          [[
            token0Addr,
            token1Addr,
            3000,
            -60,
            60,
            ethers.parseEther("10"),
            ethers.parseEther("10"),
            0,
            0,
            user1.address,
            deadline
          ]]
        )
      );

      await expect(
        migrationManager.connect(user1).batchMigrate(uniTokenIds, rubyMintParamsArray)
      ).to.be.revertedWith("Too many positions");
    });
  });

  describe("Migration Rewards and Vesting", function () {
    beforeEach(async function () {
      // Setup mock Uniswap V3 position
      await mockUniPositionManager.setPosition(
        1, // uniTokenId
        user1.address, // owner
        await token0.getAddress(), // token0
        await token1.getAddress(), // token1
        3000, // fee
        -60, // tickLower
        60, // tickUpper
        ethers.parseEther("100") // liquidity
      );

      // Setup RubySwap pool
      const fee = 3000;
      const tickSpacing = 60;
      await factory.connect(deployer).enableFeeAmount(fee, tickSpacing);
      const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), fee);
      if (poolAddress === ethers.ZeroAddress) {
        await factory.connect(deployer).createPool(await token0.getAddress(), await token1.getAddress(), fee);
      }
    });

    it("should distribute migration rewards", async function () {
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      const tx = await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);
      const receipt = await tx.wait();

      // Check for reward distribution event
      const rewardEvent = receipt!.logs.find((l: any) => l.fragment?.name === "MigrationRewardDistributed");
      expect(rewardEvent).to.not.be.undefined;

      // Check vesting state
      const vestingAmount = await migrationManager.migrationRewardVesting(user1.address);
      expect(vestingAmount).to.be.gt(0);
    });

    it("should allow claiming vested rewards after vesting period", async function () {
      // First migrate to get rewards
      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      await migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams);

      // Fast forward past vesting period
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]); // 91 days
      await ethers.provider.send("evm_mine", []);

      // Check vested amount
      const vestedAmount = await migrationManager.getVestedAmount(user1.address);
      expect(vestedAmount).to.be.gt(0);

      // Claim rewards
      const tx = await migrationManager.connect(user1).claimVestedMigrationReward();
      const receipt = await tx.wait();

      // Check for claim event
      const claimEvent = receipt!.logs.find((l: any) => l.fragment?.name === "MigrationRewardClaimed");
      expect(claimEvent).to.not.be.undefined;
    });

    it("should revert when no vested rewards to claim", async function () {
      await expect(
        migrationManager.connect(user1).claimVestedMigrationReward()
      ).to.be.revertedWithCustomError(migrationManager, "NoVestedRewards");
    });
  });

  describe("Access Control", function () {
    it("should allow admin to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await migrationManager.connect(deployer).setMaxMigrationRewards(newMaxRewards);
      expect(await migrationManager.maxMigrationRewards()).to.equal(newMaxRewards);
    });

    it("should revert when non-admin tries to set max migration rewards", async function () {
      const newMaxRewards = ethers.parseEther("2000000");
      await expect(
        migrationManager.connect(user1).setMaxMigrationRewards(newMaxRewards)
      ).to.be.reverted;
    });

    it("should allow pauser to pause", async function () {
      await migrationManager.connect(deployer).pause();
      expect(await migrationManager.paused()).to.be.true;
    });

    it("should allow pauser to unpause", async function () {
      await migrationManager.connect(deployer).pause();
      await migrationManager.connect(deployer).unpause();
      expect(await migrationManager.paused()).to.be.false;
    });

    it("should revert when non-pauser tries to pause", async function () {
      await expect(
        migrationManager.connect(user1).pause()
      ).to.be.reverted;
    });
  });

  describe("Pausable", function () {
    it("should revert migration when paused", async function () {
      await migrationManager.connect(deployer).pause();

      const uniTokenId = 1;
      const token0Addr = await token0.getAddress();
      const token1Addr = await token1.getAddress();
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
      
      const rubyMintParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)"],
        [[
          token0Addr,
          token1Addr,
          3000,
          -60,
          60,
          ethers.parseEther("10"),
          ethers.parseEther("10"),
          0,
          0,
          user1.address,
          deadline
        ]]
      );

      await expect(
        migrationManager.connect(user1).migrate(uniTokenId, rubyMintParams)
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});
