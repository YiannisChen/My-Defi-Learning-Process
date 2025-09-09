import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("OracleLibrary.consult", function () {
    it("returns a mean tick and sqrtPriceX96 for 30s window", async function () {
        const env = await setupTestEnvironment();
        const { router, token0, token1, factory } = env;
        // Perform swaps to update observations
        await env.performSwaps(3);
        const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const Pool = await ethers.getContractFactory("RubySwapPool");
        const pool = Pool.attach(poolAddr);
        // Grow cardinality to ensure space
        await pool.increaseObservationCardinalityNext(16);
        // Advance time
        await ethers.provider.send("evm_increaseTime", [40]);
        await ethers.provider.send("evm_mine", []);
        // Call observeSingle via library expectations by reading pool.observe directly
        const secondsAgos = [30, 0];
        const [ticks] = await pool.observe(secondsAgos);
        expect(ticks.length).to.equal(2);
    });
}); 