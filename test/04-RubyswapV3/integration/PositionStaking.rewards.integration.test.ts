import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../setup/test-environment";

/**
 * Integration test for PositionStaking rewards accrual with USD valuation and lock multipliers
 */
describe("PositionStaking - rewards integration", function () {
	it("accrues rewards proportionally to USD shares with lock multipliers and allows claim/unstake", async function () {
		const env = await setupTestEnvironment();
		const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

		// Configure deterministic prices via mocks (2 USD each)
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const agg0 = await MockAgg.deploy(200000000n);
		const agg1 = await MockAgg.deploy(200000000n);
		await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
		await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

		// Deploy RUBY and staking
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
		await ruby.waitForDeployment();

		const PositionStaking = await ethers.getContractFactory("PositionStaking");
		const emissionRate = ethers.parseEther("1"); // 1 RUBY/sec baseline
		const staking = await PositionStaking.deploy(
			await positionManager.getAddress(),
			await factory.getAddress(),
			await oracleRegistry.getAddress(),
			await ruby.getAddress(),
			emissionRate
		);
		await staking.waitForDeployment();

		// Fund staking with RUBY
		await ruby.mint(await staking.getAddress(), ethers.parseEther("10000000"));

		// Mint two LP NFTs for user1 with different sizes to test proportional rewards
		const latest = await ethers.provider.getBlock("latest");
		const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
		const paramsA = {
			token0: await token0.getAddress(),
			token1: await token1.getAddress(),
			fee: 3000,
			tickLower: -60,
			tickUpper: 60,
			amount0Desired: ethers.parseEther("10"),
			amount1Desired: ethers.parseEther("10"),
			amount0Min: 0,
			amount1Min: 0,
			recipient: await user1.getAddress(),
			deadline: now + 3600,
		};
		const paramsB = { ...paramsA, amount0Desired: ethers.parseEther("20"), amount1Desired: ethers.parseEther("20") };

		await token0.connect(user1).approve(await positionManager.getAddress(), paramsA.amount0Desired + paramsB.amount0Desired);
		await token1.connect(user1).approve(await positionManager.getAddress(), paramsA.amount1Desired + paramsB.amount1Desired);

		const rcA = await (await positionManager.connect(user1).mint(paramsA)).wait();
		const tokenIdA = rcA!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];
		const rcB = await (await positionManager.connect(user1).mint(paramsB)).wait();
		const tokenIdB = rcB!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];

		await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

		// Stake A with 0 lock (1.0x) and B with 30d lock (1.5x)
		await staking.connect(user1).stake(tokenIdA, 0);
		await staking.connect(user1).stake(tokenIdB, 1);

		// Advance time 2 hours
		await ethers.provider.send("evm_increaseTime", [2 * 3600]);
		await ethers.provider.send("evm_mine", []);

		// Check pending before claim; B should be >= A due to larger stake and multiplier
		const pendingA_before = await staking.pendingRewards(tokenIdA);
		const pendingB_before = await staking.pendingRewards(tokenIdB);
		expect(pendingB_before).to.be.gte(pendingA_before);

		const balBefore = await ruby.balanceOf(await user1.getAddress());
		await staking.connect(user1).claim(tokenIdA);
		await staking.connect(user1).claim(tokenIdB);
		const balAfter = await ruby.balanceOf(await user1.getAddress());
		expect(balAfter).to.be.gt(balBefore);

		// Post-claim pending may be non-zero due to time passing; ensure it's below 1 RUBY
		const pendingA_after = await staking.pendingRewards(tokenIdA);
		const pendingB_after = await staking.pendingRewards(tokenIdB);
		const oneRuby = ethers.parseEther("1");
		expect(pendingA_after).to.be.lte(oneRuby);
		expect(pendingB_after).to.be.lte(oneRuby);

		// Try to unstake B before 30d -> revert
		await expect(staking.connect(user1).unstake(tokenIdB)).to.be.revertedWithCustomError(staking, "LockActive");

		// Travel 31 days and unstake
		await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
		await ethers.provider.send("evm_mine", []);
		await expect(staking.connect(user1).unstake(tokenIdB)).to.emit(staking, "Unstaked");
	});
}); 