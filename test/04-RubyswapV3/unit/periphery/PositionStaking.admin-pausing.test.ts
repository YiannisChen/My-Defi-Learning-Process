import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - admin & pausing", function () {
	it("enforces onlyRole for admin setters and pausing/unpausing; paused state reverts", async function () {
		const env = await setupTestEnvironment();
		const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

		// Valid feeds
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const agg0 = await MockAgg.deploy(200000000n);
		const agg1 = await MockAgg.deploy(200000000n);
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

		// Only admin can set emission rate
		await expect(staking.connect(user1).setEmissionRate(123)).to.be.reverted;
		await expect(staking.connect(deployer).setEmissionRate(123)).to.emit(staking, "EmissionRateUpdated");

		// Only admin can set RUBY token
		await expect(staking.connect(user1).setRuby(await ruby.getAddress())).to.be.reverted;
		await staking.connect(deployer).setRuby(await ruby.getAddress());

		// Only PAUSER can pause; by default deployer has PAUSER_ROLE
		await expect(staking.connect(user1).pause()).to.be.reverted;
		await staking.connect(deployer).pause();

		// Paused: stake/claim/unstake revert
		const latest = await ethers.provider.getBlock("latest");
		const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
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
			deadline: now + 3600,
		};
		await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
		await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
		const rc = await (await positionManager.connect(user1).mint(mintParams)).wait();
		const tokenId = rc!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];
		await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

		await expect(staking.connect(user1).stake(tokenId, 0)).to.be.revertedWith("Pausable: paused");

		// Unpause by admin
		await staking.connect(deployer).unpause();

		await staking.connect(user1).stake(tokenId, 0);
		await expect(staking.connect(user1).claim(tokenId)).to.not.be.reverted;
	});
}); 