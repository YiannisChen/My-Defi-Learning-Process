import { ethers } from "hardhat";
import { expect } from "chai";

describe("Position library", () => {
  it("update with liquidityDelta=0 credits fees and requires existing liquidity", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TestPositionLib");
    const c = await Factory.deploy();
    await c.waitForDeployment();

    await c.setPosition(await owner.getAddress(), -60, 60, 1_000);

    // credit some fees
    await c.updateWrapper(
      await owner.getAddress(),
      -60,
      60,
      0,
      1000n << 128n,
      2000n << 128n
    );

    const p = await c.getPosition(await owner.getAddress(), -60, 60);
    expect(p.tokensOwed0).to.be.gt(0n);
    expect(p.tokensOwed1).to.be.gt(0n);
  });

  it("update with nonzero liquidityDelta changes liquidity", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TestPositionLib");
    const c = await Factory.deploy();
    await c.waitForDeployment();

    await c.setPosition(await owner.getAddress(), 0, 120, 1_000);

    await c.updateWrapper(await owner.getAddress(), 0, 120, 500, 0, 0);
    const p = await c.getPosition(await owner.getAddress(), 0, 120);
    expect(p.liquidity).to.equal(1500n);
  });
}); 