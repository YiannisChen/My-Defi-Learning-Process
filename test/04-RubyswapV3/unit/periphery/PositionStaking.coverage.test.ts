import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - Coverage Gaps", function () {
  let env: any;
  let deployer: any;
  let user1: any;
  let token0: any;
  let token1: any;
  let positionManager: any;
  let factory: any;
  let oracleRegistry: any;
  let ruby: any;
  let staking: any;

  beforeEach(async function () {
    env = await setupTestEnvironment();
    ({ deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env);

    // Set oracle feeds for valuation
    const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
    const agg0 = await MockAgg.deploy(200000000n);
    const agg1 = await MockAgg.deploy(200000000n);
    await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
    await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

    // Create pool if it doesn't exist
    const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    if (poolAddress === ethers.ZeroAddress) {
      await factory.connect(deployer).createPool(await token0.getAddress(), await token1.getAddress(), 3000);
    }

    // RUBY token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
    await ruby.waitForDeployment();

    // Deploy staking
    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1"); // 1 RUBY/sec
    staking = await PositionStaking.deploy(
      await positionManager.getAddress(),
      await factory.getAddress(),
      await oracleRegistry.getAddress(),
      await ruby.getAddress(),
      emissionRate
    );
    await staking.waitForDeployment();

    // Fund staking with RUBY to pay rewards
    await ruby.mint(await staking.getAddress(), ethers.parseEther("10000000"));
  });

  it("should test constructor ZeroAddress error for positionManager", async function () {
    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1");
    
    // Test zero positionManager
    await expect(
      PositionStaking.deploy(
        ethers.ZeroAddress, // zero positionManager
        await factory.getAddress(),
        await oracleRegistry.getAddress(),
        await ruby.getAddress(),
        emissionRate
      )
    ).to.be.revertedWithCustomError(PositionStaking, "ZeroAddress");
  });

  it("should test constructor ZeroAddress error for factory", async function () {
    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1");
    
    // Test zero factory
    await expect(
      PositionStaking.deploy(
        await positionManager.getAddress(),
        ethers.ZeroAddress, // zero factory
        await oracleRegistry.getAddress(),
        await ruby.getAddress(),
        emissionRate
      )
    ).to.be.revertedWithCustomError(PositionStaking, "ZeroAddress");
  });

  it("should test constructor ZeroAddress error for oracleRegistry", async function () {
    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1");
    
    // Test zero oracleRegistry
    await expect(
      PositionStaking.deploy(
        await positionManager.getAddress(),
        await factory.getAddress(),
        ethers.ZeroAddress, // zero oracleRegistry
        await ruby.getAddress(),
        emissionRate
      )
    ).to.be.revertedWithCustomError(PositionStaking, "ZeroAddress");
  });

  it("should test constructor ZeroAddress error for ruby", async function () {
    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1");
    
    // Test zero ruby
    await expect(
      PositionStaking.deploy(
        await positionManager.getAddress(),
        await factory.getAddress(),
        await oracleRegistry.getAddress(),
        ethers.ZeroAddress, // zero ruby
        emissionRate
      )
    ).to.be.revertedWithCustomError(PositionStaking, "ZeroAddress");
  });

  it("should test flexible staking (lockType 0) to cover default cases", async function () {
    // Mint an LP position NFT to user1
    const tickLower = -60;
    const tickUpper = 60;
    const amount0Desired = ethers.parseEther("10");
    const amount1Desired = ethers.parseEther("10");
    await token0.connect(user1).approve(await positionManager.getAddress(), amount0Desired);
    await token1.connect(user1).approve(await positionManager.getAddress(), amount1Desired);

    const mintParams = {
      token0: await token0.getAddress(),
      token1: await token1.getAddress(),
      fee: 3000,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: user1.address,
      deadline: (await ethers.provider.getBlock("latest"))!.timestamp + 600,
    };

    const tx = await positionManager.connect(user1).mint(mintParams);
    const receipt = await tx.wait();
    const tokenId = receipt!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];

    // Approve staking to transfer NFT
    await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

    // Stake with lockType 0 (flexible) - this should cover the default cases in _lockDuration and _multiplierBps
    await staking.connect(user1).stake(tokenId, 0);
    const stake = await staking.stakes(tokenId);
    expect(stake.shares).to.be.gt(0);
    expect(stake.lockType).to.equal(0);
    // No lock expiry field in Stake struct - lockType 0 means flexible

    // Unstake immediately (no lock period)
    await staking.connect(user1).unstake(tokenId);
  });
});
