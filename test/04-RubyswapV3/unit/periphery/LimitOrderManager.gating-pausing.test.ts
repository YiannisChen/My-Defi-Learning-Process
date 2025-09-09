import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("LimitOrderManager - oracle gating and pausing", function () {
    it("should keep order active when oracle invalid and not pay keeper", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, user2, token0, token1, token2, router, oracleRegistry } = env;

        // Set valid feeds
        const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
        const agg0 = await MockAgg.deploy(200000000n);
        const agg1 = await MockAgg.deploy(200000000n);
        await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
        await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        // Deploy manager
        const LimitOrderManager = await ethers.getContractFactory("LimitOrderManager");
        const mgr = await LimitOrderManager.deploy(
            await router.getAddress(),
            await oracleRegistry.getAddress(),
            await token2.getAddress(),
            1_000_000n,
            180_000n
        );
        await mgr.waitForDeployment();

        // Keeper role
        const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
        await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());

        // Approvals
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
            minAmountOut: 1,
            expiry: BigInt((latest?.timestamp || Math.floor(Date.now() / 1000)) + 3600),
            prepaidFee: prepaid,
        };
        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        // Invalidate oracle for token0
        await oracleRegistry.connect(deployer).disableFeed(await token0.getAddress(), "test");

        // Keeper attempt should revert at require and order stays active
        await expect(mgr.connect(user2).executeOrder(orderId)).to.be.revertedWith("Oracle invalid");
        const order = await mgr.getOrder(orderId);
        expect(order.active).to.equal(true);
    });

    it("should respect pause for place and execute", async function () {
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

        const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
        const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
        await mgr.connect(deployer).grantRole(PAUSER_ROLE, await deployer.getAddress());
        await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());

        await mgr.connect(deployer).pause();

        const latest = await ethers.provider.getBlock("latest");
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            sqrtPriceLimitX96: 0,
            amountIn: ethers.parseEther("1"),
            minAmountOut: 1,
            expiry: BigInt((latest?.timestamp || Math.floor(Date.now() / 1000)) + 3600),
            prepaidFee: ethers.parseUnits("1", 18),
        };
        await token2.connect(user1).approve(await mgr.getAddress(), params.prepaidFee);
        await expect(mgr.connect(user1).placeOrder(params)).to.be.revertedWith("Pausable: paused");

        await mgr.connect(deployer).unpause();
        const rc = await (await mgr.connect(user1).placeOrder(params)).wait();
        const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

        await mgr.connect(deployer).pause();
        await expect(mgr.connect(user2).executeOrder(orderId)).to.be.revertedWith("Pausable: paused");
    });
}); 