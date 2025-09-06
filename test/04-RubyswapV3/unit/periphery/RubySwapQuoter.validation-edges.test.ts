import { expect } from "chai";
import { ethers } from "hardhat";

import type { Contract } from "ethers";

describe("RubySwapQuoter - Validation Edge Cases", function () {
  let token0: Contract;
  let token1: Contract;
  let factory: Contract;
  let pool: Contract;
  let quoter: Contract;

  beforeEach(async function () {
    const [deployer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token0 = await MockERC20.deploy("Token0", "TK0", 18);
    token1 = await MockERC20.deploy("Token1", "TK1", 18);
    await token0.waitForDeployment();
    await token1.waitForDeployment();

    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const oracle = await OracleRegistry.deploy();
    await oracle.waitForDeployment();

    const Timelock = await ethers.getContractFactory("RubySwapTimelock");
    const tl = await Timelock.deploy([deployer.address], [deployer.address], deployer.address);
    await tl.waitForDeployment();

    const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
    factory = await RubySwapFactory.deploy(await tl.getAddress());
    await factory.waitForDeployment();

    const RubySwapPool = await ethers.getContractFactory("RubySwapPool");

    // Satisfy oracle gating by registering feeds for both tokens
    const registryAddr = await factory.oracleRegistry();
    const RegistryAbi = [
      "function setFeed(address token, address feed) external"
    ];
    const registry = new ethers.Contract(registryAddr, RegistryAbi, deployer);
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
    await pool.initialize("79228162514264337593543950336");

    const RubySwapQuoter = await ethers.getContractFactory("RubySwapQuoter");
    quoter = await RubySwapQuoter.deploy(await factory.getAddress());
    await quoter.waitForDeployment();
  });

  it("quoteExactInputSingle: rejects zero addresses", async function () {
    await expect(
      quoter.quoteExactInputSingle(ethers.ZeroAddress, await token1.getAddress(), 3000, 1n, 0)
    ).to.be.revertedWith("ZERO_ADDR");
    await expect(
      quoter.quoteExactInputSingle(await token0.getAddress(), ethers.ZeroAddress, 3000, 1n, 0)
    ).to.be.revertedWith("ZERO_ADDR");
  });

  it("quoteExactOutputSingle: rejects zero addresses", async function () {
    await expect(
      quoter.quoteExactOutputSingle(ethers.ZeroAddress, await token1.getAddress(), 3000, 1n, 0)
    ).to.be.revertedWith("ZERO_ADDR");
    await expect(
      quoter.quoteExactOutputSingle(await token0.getAddress(), ethers.ZeroAddress, 3000, 1n, 0)
    ).to.be.revertedWith("ZERO_ADDR");
  });

  it("quoteExactInput/Output: rejects malformed path", async function () {
    const badLenPath = ethers.solidityPacked(["address"], [await token0.getAddress()]);
    await expect(quoter.quoteExactInput(badLenPath, 1n)).to.be.revertedWith("PATH_INVALID");
    await expect(quoter.quoteExactOutput(badLenPath, 1n)).to.be.revertedWith("PATH_INVALID");
  });
}); 