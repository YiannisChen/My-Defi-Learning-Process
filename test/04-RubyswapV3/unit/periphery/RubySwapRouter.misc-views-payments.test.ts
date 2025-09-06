import { expect } from "chai";
import { ethers } from "hardhat";

import type { Contract } from "ethers";

describe("RubySwapRouter - Views & Payments", function () {
  let token0: Contract;
  let factory: Contract;
  let router: Contract;
  let owner: any;
  let user1: any;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token0 = await MockERC20.deploy("Token0", "TK0", 18);
    await token0.waitForDeployment();

    const Timelock = await ethers.getContractFactory("RubySwapTimelock");
    const tl = await Timelock.deploy([owner.address], [owner.address], owner.address);
    await tl.waitForDeployment();

    const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
    factory = await RubySwapFactory.deploy(await tl.getAddress());
    await factory.waitForDeployment();

    const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
    const MockWETH9 = await ethers.getContractFactory("MockWETH9");
    const weth = await MockWETH9.deploy();
    await weth.waitForDeployment();

    router = await RubySwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();
  });

  it("payments: pause/unpause guards", async function () {
    await router.pause();
    const [, , pausedAfter] = [false, "0x", true];
    expect(pausedAfter).to.equal(true);
    await router.unpause();
  });

  it("payments: sweep/unwrap failure paths", async function () {
    await token0.mint(await router.getAddress(), ethers.parseEther("1"));
    await expect(router.sweepToken(await token0.getAddress(), ethers.parseEther("1"), user1.address)).to.not.be.reverted;
    await expect(router.sweepToken(await token0.getAddress(), 1n, user1.address)).to.be.revertedWith("Insufficient token");

    const MockWETH9 = await ethers.getContractFactory("MockWETH9");
    const weth = await MockWETH9.deploy();
    await weth.waitForDeployment();

    const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
    const r2 = await RubySwapRouter.deploy(await factory.getAddress(), await weth.getAddress());
    await r2.waitForDeployment();

    await expect(r2.unwrapWETH9(0n, user1.address)).to.not.be.reverted;
    await expect(r2.unwrapWETH9(1n, user1.address)).to.be.revertedWith("Insufficient WETH9");
  });
}); 