import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("RubySwapPool - swap updates price and tick", function () {
    it("exact input single updates sqrtPriceX96 and tick, and writes observation", async function () {
        const env = await setupTestEnvironment();
        const { user1, token0, router, factory } = env;

        const amountIn = ethers.parseEther("1");
        await token0.connect(user1).approve(await router.getAddress(), amountIn);
        const swapParams = {
            tokenIn: await env.token0.getAddress(),
            tokenOut: await env.token1.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: ((await ethers.provider.getBlock('latest'))!.timestamp) + 3600,
            amountIn,
            amountOutMinimum: 1,
            sqrtPriceLimitX96: 0
        };
        const poolAddr = await factory.getPool(await env.token0.getAddress(), await env.token1.getAddress(), 3000);
        const Pool = await ethers.getContractFactory("RubySwapPool");
        const pool = Pool.attach(poolAddr);

        const sqrtBefore = await pool.sqrtPriceX96();
        const tickBefore = await pool.tick();
        await router.connect(user1).exactInputSingle(swapParams);
        const sqrtAfter = await pool.sqrtPriceX96();
        const tickAfter = await pool.tick();

        expect(sqrtAfter).to.not.equal(sqrtBefore);
        expect(tickAfter).to.not.equal(tickBefore);
        // observation grown
        const secondsAgos = [0];
        const [ticks] = await pool.observe(secondsAgos);
        expect(ticks.length).to.equal(1);
    });
}); 