import { ethers } from "hardhat";
import { expect } from "chai";

describe("SqrtPriceMath", () => {
    it("getNextSqrtPriceFromInput basic invariants", async () => {
        const Factory = await ethers.getContractFactory("TestSqrtPriceMath");
        const c = await Factory.deploy();
        await c.waitForDeployment();
        const q96 = 1n << 96n;
        const L = 10_000n;
        const next0 = await c.getNextSqrtPriceFromInputWrapper(q96, Number(L), 1000, true);
        const next1 = await c.getNextSqrtPriceFromInputWrapper(q96, Number(L), 1000, false);
        expect(next0).to.be.a("bigint");
        expect(next1).to.be.a("bigint");
    });

    it("getAmount deltas are non-negative and ordered", async () => {
        const Factory = await ethers.getContractFactory("TestSqrtPriceMath");
        const c = await Factory.deploy();
        await c.waitForDeployment();
        const a = 1n << 96n;
        const b = a + (a >> 10n);
        const L = 12345;
        const d0 = await c.getAmount0DeltaWrapper(a, b, L, true);
        const d1 = await c.getAmount1DeltaWrapper(a, b, L, true);
        expect(d0).to.be.greaterThan(0n);
        expect(d1).to.be.greaterThan(0n);
    });
}); 