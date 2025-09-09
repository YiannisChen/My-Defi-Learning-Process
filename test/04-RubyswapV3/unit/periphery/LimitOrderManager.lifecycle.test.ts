import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("LimitOrderManager - lifecycle", function () {
    it("should place, cancel, and reclaim fee after expiry", async function () {
        const env = await setupTestEnvironment();
        const { user1, token0, token1, router, oracleRegistry, token2 } = env;

        // Deploy mock aggregator feeds for token0 and token1
        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(2_000_000_000n);
        const agg1 = await MockAgg.deploy(2_000_000_000n);
        await env.oracleRegistry.connect(env.deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await env.oracleRegistry.connect(env.deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        // Use token2 as fee token (stable proxy)
        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            1_000_000n, // keeper incentive
            180_000n
        );
        await mgr.waitForDeployment();

        // Approvals: user1 approves prepaid fee to manager
        const prepaid = ethers.parseUnits("10", 18);
        await token2.connect(user1).approve(await mgr.getAddress(), prepaid);

        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn: ethers.parseEther("1"),
            minAmountOut: 1,
            expiry: BigInt(now + 600),
            prepaidFee: prepaid,
        };

        const tx = await mgr.connect(user1).placeOrder(params);
        const rc = await tx.wait();
        const event = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced");
        const orderId = event!.args[0];

        // Cancel by maker
        await expect(mgr.connect(env.user2).cancelOrder(orderId)).to.be.revertedWithCustomError(mgr, "NotMaker");
        await mgr.connect(user1).cancelOrder(orderId);

        // Reclaim only after expiry
        await expect(mgr.connect(user1).reclaimFee(orderId)).to.be.revertedWithCustomError(mgr, "OrderExpired");
        await ethers.provider.send("evm_increaseTime", [700]);
        await ethers.provider.send("evm_mine", []);
        const balBefore = await token2.balanceOf(await user1.getAddress());
        await mgr.connect(user1).reclaimFee(orderId);
        const balAfter = await token2.balanceOf(await user1.getAddress());
        // Policy A: refund happened on cancel, so nothing to reclaim after expiry
        expect(balAfter - balBefore).to.equal(0n);
    });

    it("should validate params and reject invalid orders", async function () {
        const env = await setupTestEnvironment();
        const { router, oracleRegistry, token0, token1, token2 } = env;
        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            1_000_000n,
            180_000n
        );
        await mgr.waitForDeployment();

        const latest2 = await ethers.provider.getBlock("latest");
        const now = (latest2?.timestamp || Math.floor(Date.now() / 1000));
        const bad = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn: 0,
            minAmountOut: 0,
            expiry: BigInt(now - 1),
            prepaidFee: 0,
        };
        await expect(mgr.placeOrder(bad)).to.be.revertedWithCustomError(mgr, "InvalidParams");
    });
}); 