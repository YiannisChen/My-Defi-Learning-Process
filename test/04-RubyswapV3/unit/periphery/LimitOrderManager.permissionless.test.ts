import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("LimitOrderManager - permissionless and idempotence", function () {
    it("allows anyone to execute when permissionedKeepers=false", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, user2, token0, token1, token2, router, oracleRegistry } = env;

        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(2_000_000_000n);
        const agg1 = await MockAgg.deploy(2_000_000_000n);
        await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            ethers.parseUnits("1", 18),
            180_000n
        );
        await mgr.waitForDeployment();
        await mgr.connect(deployer).setPermissionedKeepers(false);

        const amountIn = ethers.parseEther("1");
        const prepaid = ethers.parseUnits("2", 18);
        await token0.connect(user1).approve(await router.getAddress(), amountIn);
        await token2.connect(user1).approve(await mgr.getAddress(), prepaid);

        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn,
            minAmountOut: 1,
            expiry: BigInt(now + 3600),
            prepaidFee: prepaid,
        };
        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        // user2 executes without keeper role
        await mgr.connect(user2).executeOrder(orderId);
        const order = await mgr.getOrder(orderId);
        expect(order.active).to.equal(false);
    });

    it("resets to Active if a first execution attempt fails, preventing stuck Executing state", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, user2, token0, token1, token2, router, oracleRegistry } = env;

        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(2_000_000_000n);
        const agg1 = await MockAgg.deploy(2_000_000_000n);
        await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            ethers.parseUnits("1", 18),
            180_000n
        );
        await mgr.waitForDeployment();
        const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
        await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());

        // Intentionally skip token approval to cause execution failure
        const prepaid = ethers.parseUnits("2", 18);
        await token2.connect(user1).approve(await mgr.getAddress(), prepaid);
        const latest2 = await ethers.provider.getBlock("latest");
        const now = (latest2?.timestamp || Math.floor(Date.now() / 1000));
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn: ethers.parseEther("1"),
            minAmountOut: 1,
            expiry: BigInt(now + 3600),
            prepaidFee: prepaid,
        };
        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        await mgr.connect(user2).executeOrder(orderId);
        const orderAfter = await mgr.getOrder(orderId);
        expect(orderAfter.active).to.equal(true);
    });
}); 