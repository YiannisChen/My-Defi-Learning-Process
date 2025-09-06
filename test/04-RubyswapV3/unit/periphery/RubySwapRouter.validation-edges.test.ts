import { expect } from "chai";
import { ethers } from "hardhat";

import type { Contract } from "ethers";

describe("RubySwapRouter - Validation Edge Cases", function () {
  let token0: Contract;
  let token1: Contract;
  let factory: Contract;
  let pool: Contract;
  let router: Contract;
  let owner: any;
  let user1: any;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token0 = await MockERC20.deploy("Token0", "TK0", 18);
    token1 = await MockERC20.deploy("Token1", "TK1", 18);
    await token0.waitForDeployment();
    await token1.waitForDeployment();

    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const oracle = await OracleRegistry.deploy();
    await oracle.waitForDeployment();

    const Timelock = await ethers.getContractFactory("RubySwapTimelock");
    const tl = await Timelock.deploy([owner.address], [owner.address], owner.address);
    await tl.waitForDeployment();

    const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
    factory = await RubySwapFactory.deploy(await tl.getAddress());
    await factory.waitForDeployment();

    // Default fee tier 3000 exists in factory constructor
    const RubySwapPool = await ethers.getContractFactory("RubySwapPool");

    // Deploy pool via factory
    // Factory enforces oracle feeds, but tests don't depend on oracle gating here.
    // To satisfy gating, point factory's oracle registry to a fresh registry with both feeds disabled by default.
    // In our current factory implementation, OracleRegistry is created internally and owned by deployer.
    // For test simplicity, bypass oracle gating by setting both feeds via the internal registry owner (owner).
    const registryAddr = await factory.oracleRegistry();
    const RegistryAbi = [
      "function setFeed(address token, address feed) external",
      "function hasBothFeeds(address tokenA, address tokenB) external view returns (bool)"
    ];
    const registry = new ethers.Contract(registryAddr, RegistryAbi, owner);
    const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
    const feed0 = await MockAggregator.deploy(1n);
    const feed1 = await MockAggregator.deploy(1n);
    await feed0.waitForDeployment();
    await feed1.waitForDeployment();
    await registry.setFeed(await token0.getAddress(), await feed0.getAddress());
    await registry.setFeed(await token1.getAddress(), await feed1.getAddress());

    await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    pool = RubySwapPool.attach(poolAddr);
    await pool.initialize("79228162514264337593543950336"); // sqrtPriceX96 = Q96

    // Mint tokens
    await token0.mint(user1.address, ethers.parseEther("10000"));
    await token1.mint(user1.address, ethers.parseEther("10000"));

    // Liquidity not required for negative validation tests below

    const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
    const MockWETH9 = await ethers.getContractFactory("MockWETH9");
    const weth = await MockWETH9.deploy();
    await weth.waitForDeployment();

    router = await RubySwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();

    await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
    await token1.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
  });

  it("deadline boundary: far-future deadline reverts with 'Deadline too far'", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const now = Number(latest?.timestamp ?? 0);
    const paramsTooFar = {
      tokenIn: await token0.getAddress(),
      tokenOut: await token1.getAddress(),
      fee: 3000,
      recipient: user1.address,
      deadline: now + 3601, // beyond 1h window
      amountIn: ethers.parseEther("1"),
      amountOutMinimum: 1n,
      sqrtPriceLimitX96: 0
    };
    await expect(router.connect(user1).exactInputSingle(paramsTooFar)).to.be.reverted;
  });

  it("exactOutputSingle: amountInMaximum == 0 reverts with cap error", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const now = Number(latest?.timestamp ?? 0);
    const params = {
      tokenIn: await token0.getAddress(),
      tokenOut: await token1.getAddress(),
      fee: 3000,
      recipient: user1.address,
      deadline: now + 3600,
      amountOut: ethers.parseEther("1"),
      amountInMaximum: 0,
      sqrtPriceLimitX96: 0
    };
    await expect(router.connect(user1).exactOutputSingle(params)).to.be.revertedWith("Input limit too high");
  });

  it("multicall: bubbles revert on invalid inner call", async function () {
    const badCalldata = ethers.randomBytes(4); // invalid selector
    await expect(router.connect(user1).multicall([badCalldata])).to.be.reverted;
  });

  it("path validation: empty path and bad length rejected", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const now = Number(latest?.timestamp ?? 0);
    const emptyPath = "0x";

    await expect(
      router.connect(user1).exactInput({
        path: emptyPath,
        recipient: user1.address,
        deadline: now + 3600,
        amountIn: ethers.parseEther("1"),
        amountOutMinimum: 1n
      })
    ).to.be.revertedWith("EMPTY_PATH");

    // Bad length: address(20) only
    const badLenPath = ethers.solidityPacked(["address"], [await token0.getAddress()]);
    await expect(
      router.connect(user1).exactInput({
        path: badLenPath,
        recipient: user1.address,
        deadline: now + 3600,
        amountIn: ethers.parseEther("1"),
        amountOutMinimum: 1n
      })
    ).to.be.reverted;
  });

  it("payments: unwrapWETH9 success and min-failure", async function () {
    const MockWETH9 = await ethers.getContractFactory("MockWETH9");
    const weth = await MockWETH9.deploy();
    await weth.waitForDeployment();

    const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
    const r2 = await RubySwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await r2.waitForDeployment();

    // No WETH balance: unwrap with amountMinimum=0 succeeds (no-op)
    await expect(r2.unwrapWETH9(0n, user1.address)).to.not.be.reverted;
    // Require >0 should fail due to insufficient balance
    await expect(r2.unwrapWETH9(1n, user1.address)).to.be.revertedWith("Insufficient WETH9");
  });

  it("payments: sweepToken success and min-failure", async function () {
    // Transfer token0 to router, then sweep
    await token0.mint(await router.getAddress(), ethers.parseEther("5"));
    await expect(router.sweepToken(await token0.getAddress(), ethers.parseEther("5"), user1.address)).to.not.be.reverted;

    // No balance remaining; require >0 should fail
    await expect(router.sweepToken(await token0.getAddress(), 1n, user1.address)).to.be.revertedWith("Insufficient token");
  });
}); 