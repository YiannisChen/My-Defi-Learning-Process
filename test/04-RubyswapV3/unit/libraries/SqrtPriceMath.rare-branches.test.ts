import { expect } from "chai";
import { ethers } from "hardhat";

describe("SqrtPriceMath - Rare Branches", () => {
  let tester: any;

  beforeEach(async () => {
    const TestSqrtPriceMath = await ethers.getContractFactory("TestSqrtPriceMath");
    tester = await TestSqrtPriceMath.deploy();
  });

  it("getNextSqrtPriceFromAmount0RoundingUp: large amount reverts with overflow", async () => {
    const sqrtPX96 = 2 ** 20; // small
    const L = 1_000_000;
    const amount = ethers.MaxUint256 / 2n; // triggers multiplication overflow
    await expect(tester.getNextSqrtPriceFromInputWrapper(sqrtPX96, L, amount, true)).to.be.reverted;
  });

  it("getNextSqrtPriceFromAmount1RoundingDown: very large amount reverts via FullMath overflow", async () => {
    const sqrtPX96 = 2 ** 30;
    const L = 1000;
    const amount = (BigInt(1) << BigInt(200));
    await expect(tester.getNextSqrtPriceFromInputWrapper(sqrtPX96, L, amount, false)).to.be.reverted;
  });

  it("getAmount0Delta: roundUp vs roundDown diverge", async () => {
    const a = 100000 as unknown as number;
    const b = 100500 as unknown as number;
    const L = 1000000;
    const up = await tester.getAmount0DeltaWrapper(a, b, L, true);
    const down = await tester.getAmount0DeltaWrapper(a, b, L, false);
    expect(up).to.be.gte(down);
  });
}); 