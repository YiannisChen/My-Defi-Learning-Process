import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - oracle invalid gating", function () {
	it("reverts stake when oracle prices are invalid or disabled", async function () {
		const env = await setupTestEnvironment();
		const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

		// Do NOT set feeds (or disable them) to simulate invalid oracle
		// Disable if pre-set by environment
		await oracleRegistry.connect(deployer).disableFeed(await token0.getAddress(), "test").catch(() => {});
		await oracleRegistry.connect(deployer).disableFeed(await token1.getAddress(), "test").catch(() => {});

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

		// Prepare an NFT with on-chain deadline
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
		const rc = await (await positionManager.connect(user1).mint(mintParams)).wait();
		const tokenId = rc!.logs.find((l: any) => l.fragment?.name === "Transfer")!.args[2];
		await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

		await expect(staking.connect(user1).stake(tokenId, 0)).to.be.revertedWithCustomError(staking, "InvalidPrice");
	});
}); 