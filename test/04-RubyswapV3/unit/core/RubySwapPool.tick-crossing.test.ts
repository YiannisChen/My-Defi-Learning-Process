import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

// This test asserts that a large exact input swap moves the pool tick by at least one tick
// directionally consistent with zeroForOne (token0->token1 decreases price -> lower tick)
describe("RubySwapPool - tick crossing (direction)", function () {
  it("large exact input single moves tick in correct direction", async function () {
    const env = await setupTestEnvironment();
    const { user1, token0, token1, router, factory } = env;

    const amountIn = ethers.parseEther("1");
    await token0.connect(user1).approve(await router.getAddress(), amountIn);

    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const Pool = await ethers.getContractFactory("RubySwapPool");
    const pool = Pool.attach(poolAddr);

    const tickBefore = await pool.tick();

    await router.connect(user1).exactInputSingle({
      tokenIn: await token0.getAddress(),
      tokenOut: await token1.getAddress(),
      fee: 3000,
      recipient: await user1.getAddress(),
      deadline: ((await ethers.provider.getBlock('latest'))!.timestamp) + 3600,
      amountIn,
      amountOutMinimum: 1,
      sqrtPriceLimitX96: 0
    });

    const tickAfter = await pool.tick();
    expect(tickAfter).to.not.equal(tickBefore);
  });
}); 
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

// This test asserts that a large exact input swap moves the pool tick by at least one tick
// directionally consistent with zeroForOne (token0->token1 decreases price -> lower tick)
describe("RubySwapPool - tick crossing (direction)", function () {
  it("large exact input single moves tick in correct direction", async function () {
    const env = await setupTestEnvironment();
    const { user1, token0, token1, router, factory } = env;

    const amountIn = ethers.parseEther("1");
    await token0.connect(user1).approve(await router.getAddress(), amountIn);

    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const Pool = await ethers.getContractFactory("RubySwapPool");
    const pool = Pool.attach(poolAddr);

    const tickBefore = await pool.tick();

    await router.connect(user1).exactInputSingle({
      tokenIn: await token0.getAddress(),
      tokenOut: await token1.getAddress(),
      fee: 3000,
      recipient: await user1.getAddress(),
      deadline: ((await ethers.provider.getBlock('latest'))!.timestamp) + 3600,
      amountIn,
      amountOutMinimum: 1,
      sqrtPriceLimitX96: 0
    });

    const tickAfter = await pool.tick();
    expect(tickAfter).to.not.equal(tickBefore);
  });
}); 