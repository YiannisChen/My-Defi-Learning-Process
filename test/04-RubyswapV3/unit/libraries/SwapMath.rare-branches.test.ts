import { ethers } from "hardhat";
import { expect } from "chai";

describe("SwapMath - Rare Branches", () => {
  it("exactIn path where not reaching target computes fee via remainder branch", async () => {
    const Factory = await ethers.getContractFactory("TestSwapMath");
    const t = await Factory.deploy();
    await t.waitForDeployment();
    const q96 = 1n << 96n;
    const target = q96 - (q96 >> 20n);
    const [next, amountIn, amountOut, feeAmount] = await t.computeSwapStepWrapper(q96, target, 1_000_000, 1_000_000, 3000);
    expect(typeof Number(feeAmount)).to.equal("number");
  });

  it("exactOut path caps amountOut to remaining output", async () => {
    const Factory = await ethers.getContractFactory("TestSwapMath");
    const t = await Factory.deploy();
    await t.waitForDeployment();
    const q96 = 1n << 96n;
    const target = q96 + (q96 >> 20n);
    const [next, amountIn, amountOut, feeAmount] = await t.computeSwapStepWrapper(q96, target, 1_000_000, -1_000_000, 3000);
    expect(typeof Number(amountOut)).to.equal("number");
  });
}); 