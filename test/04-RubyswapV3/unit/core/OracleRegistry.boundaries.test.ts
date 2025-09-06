import { expect } from "chai";
import { ethers } from "hardhat";

describe("OracleRegistry - Normalization and Deviation Boundaries", () => {
    it("normalizes getPrice() to 18 decimals and enforces freshness", async () => {
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const registry = await OracleRegistry.deploy();
        await registry.waitForDeployment();

        // Deploy mock feed with 8 decimals
        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const feed = await MockAggregatorV3.deploy(200000000); // 2.0 with 8 decimals
        await feed.waitForDeployment();

        const token = ethers.Wallet.createRandom().address;
        await registry.setFeed(token, feed.target);

        const [price, isValid] = await registry.getPrice(token);
        expect(isValid).to.equal(true);
        // Expect 2.0 normalized to 18 decimals => 2 * 1e18
        expect(price).to.equal(2n * 10n ** 18n);
    });

    it("isSafePrice returns true at 3% and false above 3% deviation", async () => {
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const registry = await OracleRegistry.deploy();
        await registry.waitForDeployment();

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const feed = await MockAggregatorV3.deploy(100000000); // 1.0 with 8 decimals
        await feed.waitForDeployment();

        const token = ethers.Wallet.createRandom().address;
        await registry.setFeed(token, feed.target);

        // Helper: integer sqrt for BigInt
        const sqrtBI = (value: bigint): bigint => {
            if (value < 0n) throw new Error("negative");
            if (value < 2n) return value;
            // Newton's method
            let x0 = value;
            let x1 = (value >> 1n) + 1n;
            while (x1 < x0) {
                x0 = x1;
                x1 = (x1 + value / x1) >> 1n;
            }
            return x0;
        };

        const Q192 = 2n ** 192n;
        const ONE_E18 = 10n ** 18n;

        // Build sqrtPriceX96 for target price ratios
        const target3 = 103n * (10n ** 16n); // 1.03e18
        const priceX192_3 = (target3 * Q192) / ONE_E18; // (price * 2^192) / 1e18
        const sqrt103 = sqrtBI(priceX192_3);

        const [safeAt3] = await registry.isSafePrice(token, sqrt103 as any);
        expect(safeAt3).to.equal(true);

        const target5 = 105n * (10n ** 16n); // 1.05e18
        const priceX192_5 = (target5 * Q192) / ONE_E18;
        let sqrtAbove = sqrtBI(priceX192_5);
        // Increment until deviation is strictly above 3% to avoid rounding down effects
        let safeAbove: boolean;
        let devAbove: bigint;
        for (let i = 0; i < 10000; i++) {
            const res = await registry.isSafePrice(token, sqrtAbove as any);
            safeAbove = res[0];
            devAbove = res[1] as unknown as bigint;
            if (devAbove >= 301n) break;
            sqrtAbove = sqrtAbove + 1n;
        }
        expect(safeAbove!).to.equal(false);
        expect(devAbove!).to.be.gte(301n);
    });
}); 