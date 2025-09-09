import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - emission decay", function () {
	it("executeMonthlyDecay reduces emission rate and enforces interval guard", async function () {
		const env = await setupTestEnvironment();
		const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

		// Valid feeds
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const agg0 = await MockAgg.deploy(2_000_000_000n);
		const agg1 = await MockAgg.deploy(2_000_000_000n);
		await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
		await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

		// RUBY and staking
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
		await ruby.waitForDeployment();

		const PositionStaking = await ethers.getContractFactory("PositionStaking");
		const emissionRate = ethers.parseEther("1");
		const staking = await PositionStaking.deploy(
			await positionManager.getAddress(),
			await factory.getAddress(),
			await oracleRegistry.getAddress(),
			await ruby.getAddress(),
			emissionRate
		);
		await staking.waitForDeployment();
		await ruby.mint(await staking.getAddress(), ethers.parseEther("10000000"));

		// Mint one NFT with on-chain deadline
		const latest = await ethers.provider.getBlock("latest");
		const dl = (latest?.timestamp || Math.floor(Date.now() / 1000)) + 3600;
		const mintParams = {
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
			deadline: dl,
		};
		await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
		await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
		await (await positionManager.connect(user1).mint(mintParams)).wait();
		const tokenId = (await positionManager.queryFilter(positionManager.filters.Transfer(null, await user1.getAddress()))).slice(-1)[0].args?.tokenId ?? 1n;
		await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

		await staking.connect(user1).stake(tokenId, 0);

		// Advance at least decayInterval (30 days) and execute monthly decay
		await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600]);
		await ethers.provider.send("evm_mine", []);

		const prev = await staking.emissionRatePerSecond();
		await expect(staking.connect(deployer).executeMonthlyDecay()).to.emit(staking, "DecayExecuted");
		const next = await staking.emissionRatePerSecond();
		expect(next).to.equal((prev * 95n) / 100n);

		// Try executing again immediately -> should revert due to guard
		await expect(staking.connect(deployer).executeMonthlyDecay()).to.be.revertedWith("decay:interval");
	});
}); 