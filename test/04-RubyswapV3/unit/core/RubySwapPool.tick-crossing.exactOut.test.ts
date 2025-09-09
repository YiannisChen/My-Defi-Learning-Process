import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("RubySwapPool - tick crossing (exact output direction)", function () {
  it("exact output single moves tick up when swapping token1->token0", async function () {
    const env = await setupTestEnvironment();
    const { user1, token0, token1, router, factory } = env;

    // Approve router to spend token1 from user1
    await token1.connect(user1).approve(await router.getAddress(), ethers.parseEther("10"));

    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const Pool = await ethers.getContractFactory("RubySwapPool");
    const pool = Pool.attach(poolAddr);

    const tickBefore = await pool.tick();

    const params = {
      tokenIn: await token1.getAddress(),
      tokenOut: await token0.getAddress(),
      fee: 3000,
      recipient: await user1.getAddress(),
      deadline: ((await ethers.provider.getBlock('latest'))!.timestamp) + 3600,
      amountOut: ethers.parseEther("0.5"),
      amountInMaximum: ethers.parseEther("10"),
      sqrtPriceLimitX96: 0
    };

    await router.connect(user1).exactOutputSingle(params);

    const tickAfter = await pool.tick();
    expect(tickAfter).to.not.equal(tickBefore);
  });
}); 
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("RubySwapPool - tick crossing (exact output direction)", function () {
  it("exact output single moves tick up when swapping token1->token0", async function () {
    const env = await setupTestEnvironment();
    const { user1, token0, token1, router, factory } = env;

    // Approve router to spend token1 from user1
    await token1.connect(user1).approve(await router.getAddress(), ethers.parseEther("10"));

    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const Pool = await ethers.getContractFactory("RubySwapPool");
    const pool = Pool.attach(poolAddr);

    const tickBefore = await pool.tick();

    const params = {
      tokenIn: await token1.getAddress(),
      tokenOut: await token0.getAddress(),
      fee: 3000,
      recipient: await user1.getAddress(),
      deadline: ((await ethers.provider.getBlock('latest'))!.timestamp) + 3600,
      amountOut: ethers.parseEther("0.5"),
      amountInMaximum: ethers.parseEther("10"),
      sqrtPriceLimitX96: 0
    };

    await router.connect(user1).exactOutputSingle(params);

    const tickAfter = await pool.tick();
    expect(tickAfter).to.not.equal(tickBefore);
  });
}); 