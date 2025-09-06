import { ethers } from "hardhat";
import { expect } from "chai";

describe("Tick library", () => {
  it("tickSpacingToMaxLiquidityPerTick returns positive", async () => {
    const Factory = await ethers.getContractFactory("TestTickLib");
    const c = await Factory.deploy();
    await c.waitForDeployment();
    const v = await c.tickSpacingToMaxLiquidityPerTickWrapper(60);
    expect(v).to.be.gt(0n);
  });

  it("update flips initialization and enforces max liquidity", async () => {
    const Factory = await ethers.getContractFactory("TestTickLib");
    const c = await Factory.deploy();
    await c.waitForDeployment();

    const flipped = await c.updateWrapper.staticCall(0, 0, 1000, 0, 0, 0, 0, 0, false, 10_000);
    expect(flipped).to.equal(true);

    await expect(
      c.updateWrapper(0, 0, 100_000_000_000, 0, 0, 0, 0, 0, false, 10_000)
    ).to.be.reverted;
  });
}); 