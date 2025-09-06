import { ethers } from "hardhat";
import { expect } from "chai";

describe("Pool Deploy & Initialize (current stubs)", () => {
  it("deploys a pool and unimplemented methods revert (except initialize)", async () => {
    const [deployer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const tokenA = await Token.deploy("TokenA", "TKA", 18);
    await tokenA.waitForDeployment();
    const tokenB = await Token.deploy("TokenB", "TKB", 6);
    await tokenB.waitForDeployment();

    const Deployer = await ethers.getContractFactory("TestPoolDeployer");
    // Set factory to deployer for sanity
    const poolDeployer = await Deployer.deploy(await deployer.getAddress());
    await poolDeployer.waitForDeployment();

    const fee = 3000; // 0.3%
    const tickSpacing = 60; // sample

    // Predict return value with staticCall, then execute
    const poolAddress = await poolDeployer.deploy.staticCall(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      fee,
      tickSpacing
    );
    await poolDeployer.deploy(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      fee,
      tickSpacing
    );

    const pool = await ethers.getContractAt("RubySwapPool", poolAddress);
    expect(await pool.factory()).to.equal(await deployer.getAddress());
    expect(await pool.token0()).to.be.properAddress;
    expect(await pool.token1()).to.be.properAddress;

    await expect(pool.initialize(1n << 96n)).to.not.be.reverted;
    // mint will fail because deployer doesn't implement callback
    await expect(pool.mint(await deployer.getAddress(), -60, 60, 1000, "0x")).to.be.reverted;
  });
}); 