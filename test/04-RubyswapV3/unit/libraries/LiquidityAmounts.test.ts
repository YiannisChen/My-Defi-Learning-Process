import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("LiquidityAmounts", function () {
    let tester: Contract;

    before(async function () {
        const Tester = await ethers.getContractFactory("LiquidityAmountsTester");
        tester = await Tester.deploy();
    });

    it("round-trips amounts and liquidity for symmetric range", async function () {
        const Q96 = 79228162514264337593543950336n; // 2^96
        const sqrtPriceX96 = Q96; // current price 1:1
        const sqrtPriceAX96 = Q96 / 2n; // lower bound
        const sqrtPriceBX96 = Q96 * 2n; // upper bound
        const amount0 = ethers.parseEther("1");
        const amount1 = ethers.parseEther("1");

        const liq = await tester.testGetLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0, amount1);
        expect(liq).to.be.gt(0);

        const [out0, out1] = await tester.testGetAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, liq);
        expect(out0).to.be.gt(0);
        expect(out1).to.be.gt(0);
    });
}); 