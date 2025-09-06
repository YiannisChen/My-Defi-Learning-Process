import { ethers } from "hardhat";
import { expect } from "chai";

describe("SwapMath", () => {
    it("computeSwapStep returns sane values for exactIn", async () => {
        const Factory = await ethers.getContractFactory("TestSwapMath");
        const c = await Factory.deploy();
        await c.waitForDeployment();

        const q96 = 1n << 96n;
        const target = q96 + (q96 >> 10n);
        const res = await c.computeSwapStepWrapper(q96, target, 100000, 10000, 3000);
        const [next, amountIn, amountOut, feeAmount] = res;
        expect(next).to.be.a("bigint");
        expect(amountIn + feeAmount).to.be.lte(10000n);
        expect(amountOut).to.be.a("bigint");
    });

    it("computeSwapStep returns sane values for exactOut", async () => {
        const Factory = await ethers.getContractFactory("TestSwapMath");
        const c = await Factory.deploy();
        await c.waitForDeployment();

        const q96 = 1n << 96n;
        const target = q96 - (q96 >> 10n);
        const res = await c.computeSwapStepWrapper(q96, target, 100000, -10000, 3000);
        const [next, amountIn, amountOut, feeAmount] = res;
        expect(next).to.be.a("bigint");
        expect(amountOut).to.be.lte(10000n);
        expect(amountIn + feeAmount).to.be.a("bigint");
    });
}); 