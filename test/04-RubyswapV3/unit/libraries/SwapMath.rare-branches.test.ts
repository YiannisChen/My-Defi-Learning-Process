import { expect } from "chai";
import { ethers } from "hardhat";

describe("SwapMath - Rare Branches", () => {
  let tester: any;

  beforeEach(async () => {
    const TestSwapMath = await ethers.getContractFactory("TestSwapMath");
    tester = await TestSwapMath.deploy();
  });

  it("exactIn path where not reaching target computes fee via remainder branch", async () => {
    const sqrtCurrent = 2 ** 40;
    const sqrtTarget = sqrtCurrent + 1000;
    const L = 10_000_000;
    const amountRemaining = 1000; // small so next != target
    const feePips = 3000; // 0.3%
    const res = await tester.computeSwapStepWrapper(sqrtCurrent, sqrtTarget, L, amountRemaining, feePips);
    expect(res.feeAmount).to.be.gt(0);
  });

  it("exactOut path caps amountOut to remaining output", async () => {
    const sqrtCurrent = 2 ** 40;
    const sqrtTarget = sqrtCurrent - 1000;
    const L = 10_000_000;
    const amountRemaining = -1000; // exactOut
    const feePips = 3000;
    const res = await tester.computeSwapStepWrapper(sqrtCurrent, sqrtTarget, L, amountRemaining, feePips);
    expect(res.amountOut).to.be.lte(1000);
  });
}); 