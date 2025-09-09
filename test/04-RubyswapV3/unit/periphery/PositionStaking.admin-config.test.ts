import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - admin/config + getters + errors", function () {
  it("implements setters/getters and enforces guards & custom errors", async function () {
    const env = await setupTestEnvironment();
    const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

    // Valid feeds
    const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
    const agg0 = await MockAgg.deploy(2_000_000_000n);
    const agg1 = await MockAgg.deploy(2_000_000_000n);
    await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
    await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

    // RUBY and staking
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
    await ruby.waitForDeployment();

    const PositionStaking = await ethers.getContractFactory("PositionStaking");
    const emissionRate = ethers.parseEther("1");
    const staking = await PositionStaking.deploy(
      await positionManager.getAddress(),
      await factory.getAddress(),
      await oracleRegistry.getAddress(),
      await ruby.getAddress(),
      emissionRate
    );
    await staking.waitForDeployment();

    // Prefund rewards
    await ruby.mint(await staking.getAddress(), ethers.parseEther("10000000"));

    // Initial getters
    expect(await staking.twapEnabled()).to.equal(false);
    expect(await staking.decayInterval()).to.equal(30n * 24n * 3600n);
    const lastDecay = await staking.lastDecayTime();
    expect(lastDecay).to.be.a("bigint");

    // setTwapEnabled, setDecayInterval, setOracleRegistry
    await staking.connect(deployer).setTwapEnabled(true);
    expect(await staking.twapEnabled()).to.equal(true);

    // decay interval guard: non-zero required
    await expect(staking.connect(deployer).setDecayInterval(0)).to.be.revertedWith("interval=0");
    await staking.connect(deployer).setDecayInterval(10 * 24 * 3600);
    expect(await staking.decayInterval()).to.equal(10n * 24n * 3600n);

    // swap oracle registry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const newReg = await OracleRegistry.deploy();
    await newReg.waitForDeployment();
    await staking.connect(deployer).setOracleRegistry(await newReg.getAddress());
    expect(await staking.oracleRegistry()).to.equal(await newReg.getAddress());

    // Set feeds on the new registry to keep staking functional
    const agg0b = await MockAgg.deploy(2_000_000_000n);
    const agg1b = await MockAgg.deploy(2_000_000_000n);
    await newReg.connect(deployer).setFeed(await token0.getAddress(), await agg0b.getAddress());
    await newReg.connect(deployer).setFeed(await token1.getAddress(), await agg1b.getAddress());

    // Mint an LP position NFT to user1
    const latest = await ethers.provider.getBlock("latest");
    const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
    const mintParams = {
      token0: await token0.getAddress(),
      token1: await token1.getAddress(),
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: ethers.parseEther("5"),
      amount1Desired: ethers.parseEther("5"),
      amount0Min: 0,
      amount1Min: 0,
      recipient: await user1.getAddress(),
      deadline: now + 3600,
    };
    await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
    await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
    const rc = await (await positionManager.connect(user1).mint(mintParams)).wait();
    const tokenId = rc!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];

    // Approve staking to transfer NFT and test InvalidLock
    await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);
    await expect(staking.connect(user1).stake(tokenId, 3)).to.be.revertedWithCustomError(staking, "InvalidLock");

    // Stake with valid lock and verify Staked event payload (usdValueScaled > 0)
    const stakeTx = await (await staking.connect(user1).stake(tokenId, 1)).wait();
    const stakeEv = stakeTx!.logs.find((l: any) => l.fragment?.name === "Staked");
    expect(stakeEv).to.exist;
    const usdValueScaled = stakeEv!.args[3] as bigint;
    expect(usdValueScaled).to.be.gt(0n);

    // AlreadyStaked on duplicate
    await expect(staking.connect(user1).stake(tokenId, 1)).to.be.revertedWithCustomError(staking, "AlreadyStaked");

    // NotOwner on claim/unstake by wrong account
    await expect(staking.connect(deployer).claim(tokenId)).to.be.revertedWithCustomError(staking, "NotOwner");
    await expect(staking.connect(deployer).unstake(tokenId)).to.be.revertedWithCustomError(staking, "NotOwner");

    // LockActive before expiry
    await expect(staking.connect(user1).unstake(tokenId)).to.be.revertedWithCustomError(staking, "LockActive");

    // Fast-forward beyond lock and verify Unstaked event payload
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
    await ethers.provider.send("evm_mine", []);
    const unstakeRc = await (await staking.connect(user1).unstake(tokenId)).wait();
    const unstakeEv = unstakeRc!.logs.find((l: any) => l.fragment?.name === "Unstaked");
    expect(unstakeEv).to.exist;
    const unstakeUsd = unstakeEv!.args[2] as bigint;
    expect(unstakeUsd).to.equal(usdValueScaled);
  });
});
