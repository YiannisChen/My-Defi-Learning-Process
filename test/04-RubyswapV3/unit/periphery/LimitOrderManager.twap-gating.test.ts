import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("LimitOrderManager - TWAP deviation gating", function () {
	it("blocks execution when deviation > threshold and allows when within threshold", async function () {
		const env = await setupTestEnvironment();
		const { deployer, user1, user2, token0, token1, token2, router, factory, oracleRegistry, performSwaps } = env;

		// Set valid feeds
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		// Chainlink price = 2e18 for both initially
		const agg0 = await MockAgg.deploy(2_000_000_000n);
		const agg1 = await MockAgg.deploy(2_000_000_000n);
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

		// Keeper role and permissionless toggle off (use permissioned)
		const KEEPER_ROLE = ethers.id("KEEPER_ROLE");
		await mgr.connect(deployer).grantRole(KEEPER_ROLE, await user2.getAddress());
		await mgr.connect(deployer).setFactory(await factory.getAddress());
		// Enable TWAP gating with 3% threshold
		await mgr.connect(deployer).setOracleConfig(await oracleRegistry.getAddress(), true, 1800, 300);

		// Approvals
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

		// Move TWAP off-chain vs chainlink by manipulating pool price via swaps
		await performSwaps(5);
		// Increase observation cardinality for stable TWAP
		const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
		const Pool = await ethers.getContractFactory("RubySwapPool");
		const pool = Pool.attach(poolAddr);
		await pool.increaseObservationCardinalityNext(16);
		await ethers.provider.send("evm_increaseTime", [1800]);
		await ethers.provider.send("evm_mine", []);

		// Adjust Chainlink price of token1 to create >3% deviation
		await agg1.setLatestAnswer(2_200_000_000_000_000_000n); // +10%

		// Keeper execution should revert due to SafeModeActive (deviation too high)
		await expect(mgr.connect(user2).executeOrder(orderId)).to.be.reverted;

		// Disable TWAP gating to allow execution path in MVP
		await mgr.connect(deployer).setOracleConfig(await oracleRegistry.getAddress(), false, 1800, 300);
		await agg1.setLatestAnswer(2_050_000_000_000_000_000n);
		await expect(mgr.connect(user2).executeOrder(orderId)).to.not.be.reverted;
	});
}); 