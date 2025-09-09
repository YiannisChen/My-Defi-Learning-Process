import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("MigrationManager - Basic Tests", function () {
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
  });

  describe("Contract State", function () {
    it("should be unpaused initially", async function () {
      expect(await migrationManager.paused()).to.be.false;
    });

    it("should have correct initial max migration rewards", async function () {
      expect(await migrationManager.maxMigrationRewards()).to.equal(ethers.parseEther("1000000"));
    });

    it("should have RUBY token balance for rewards", async function () {
      const balance = await ruby.balanceOf(await migrationManager.getAddress());
      expect(balance).to.equal(ethers.parseEther("1000000"));
    });
  });
});
