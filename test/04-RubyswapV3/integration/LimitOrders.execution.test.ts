import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../setup/test-environment";

describe("Limit Orders - Keeper Execution", function () {
    it("executes order when price condition met and pays keeper", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, user2, token0, token1, token2, router, oracleRegistry } = env;

        // Set real mock feeds
        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(200000000n);
        const agg1 = await MockAgg.deploy(200000000n);
        await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        // Deploy manager with token2 as fee token
        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            1_000_000n,
            180_000n
        );
        await mgr.waitForDeployment();

        // Grant keeper role to user2
        const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
        await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());

        // Maker approvals: tokenIn for router, feeToken for manager
        const amountIn = ethers.parseEther("1");
        const prepaid = ethers.parseUnits("2", 18);
        await token0.connect(user1).approve(await router.getAddress(), amountIn);
        await token2.connect(user1).approve(await mgr.getAddress(), prepaid);

        const latest = await ethers.provider.getBlock("latest");
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn,
            minAmountOut: 1, // any positive
            expiry: BigInt((latest?.timestamp || Math.floor(Date.now() / 1000)) + 3600),
            prepaidFee: prepaid,
        };

        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        // Keeper executes
        const keeperBalBefore = await token2.balanceOf(await user2.getAddress());
        const outBalBefore = await token1.balanceOf(await user1.getAddress());

        await mgr.connect(user2).executeOrder(orderId);

        const outBalAfter = await token1.balanceOf(await user1.getAddress());
        const keeperBalAfter = await token2.balanceOf(await user2.getAddress());

        expect(outBalAfter).to.be.greaterThan(outBalBefore);
        expect(keeperBalAfter - keeperBalBefore).to.equal(prepaid);

        // Order should be inactive
        const order = await mgr.getOrder(orderId);
        expect(order.active).to.equal(false);
    });

    it("keeps order active if execution fails (e.g., missing allowance)", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, user2, token0, token1, token2, router, oracleRegistry } = env;

        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(200000000n);
        const agg1 = await MockAgg.deploy(200000000n);
        await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            1_000_000n,
            180_000n
        );
        await mgr.waitForDeployment();
        const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
        await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());

        // Intentionally skip tokenIn approval to router
        const prepaid = ethers.parseUnits("1", 18);
        await token2.connect(user1).approve(await mgr.getAddress(), prepaid);

        const latest = await ethers.provider.getBlock("latest");
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn: ethers.parseEther("1"),
            minAmountOut: 1,
            expiry: BigInt((latest?.timestamp || Math.floor(Date.now() / 1000)) + 3600),
            prepaidFee: prepaid,
        };

        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        await mgr.connect(user2).executeOrder(orderId);

        // Should remain active and fee not transferred to keeper
        const order = await mgr.getOrder(orderId);
        expect(order.active).to.equal(true);
    });
}); 