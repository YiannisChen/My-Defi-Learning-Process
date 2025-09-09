import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTestEnvironment } from "../../setup/test-environment";

describe("PositionStaking - basic", function () {
    it("stake -> accrue -> claim -> unstake after lock", async function () {
        const env = await setupTestEnvironment();
        const { deployer, user1, token0, token1, positionManager, factory, oracleRegistry } = env;

        // Set oracle feeds for valuation
        		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const agg0 = await MockAgg.deploy(200000000n);
		const agg1 = await MockAgg.deploy(200000000n);
		await oracleRegistry.connect(deployer).setFeed(await token0.getAddress(), await agg0.getAddress());
		await oracleRegistry.connect(deployer).setFeed(await token1.getAddress(), await agg1.getAddress());

        // RUBY token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const ruby = await MockERC20.deploy("RUBY", "RUBY", 18);
        await ruby.waitForDeployment();

        // Deploy staking
        const PositionStaking = await ethers.getContractFactory("PositionStaking");
        const emissionRate = ethers.parseEther("1"); // 1 RUBY/sec
        const staking = await PositionStaking.deploy(
            await positionManager.getAddress(),
            await factory.getAddress(),
            await oracleRegistry.getAddress(),
            await ruby.getAddress(),
            emissionRate
        );
        await staking.waitForDeployment();

        // Fund staking with RUBY to pay rewards
        await ruby.mint(await staking.getAddress(), ethers.parseEther("10000000"));

        // Mint an LP position NFT to user1
        const tickLower = -60;
        const tickUpper = 60;
        const amount0Desired = ethers.parseEther("10");
        const amount1Desired = ethers.parseEther("10");
        await token0.connect(user1).approve(await positionManager.getAddress(), amount0Desired);
        await token1.connect(user1).approve(await positionManager.getAddress(), amount1Desired);

		const latest = await ethers.provider.getBlock("latest");
		const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const mintParams = {
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: await user1.getAddress(),
            deadline: now + 3600,
        };
        const rc = await (await positionManager.connect(user1).mint(mintParams)).wait();
        const ev = rc!.logs.find((l: any) => l.fragment?.name === "IncreaseLiquidity");
        expect(ev).to.exist;
        // Infer tokenId from Transfer event
        const transferEv = rc!.logs.find((l: any) => l.fragment?.name === "Transfer");
        const tokenId = transferEv!.args[2];

        // Approve staking to transfer NFT
        await positionManager.connect(user1).setApprovalForAll(await staking.getAddress(), true);

        // Stake with 30d lock (1)
        await staking.connect(user1).stake(tokenId, 1);

        // Time travel 1 hour
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine", []);

        const balBefore = await ruby.balanceOf(await user1.getAddress());
        await staking.connect(user1).claim(tokenId);
        const balAfter = await ruby.balanceOf(await user1.getAddress());
        expect(balAfter).to.be.gt(balBefore);

        // Should not allow unstake before 30d (custom error LockActive)
        await expect(staking.connect(user1).unstake(tokenId)).to.be.revertedWithCustomError(staking, "LockActive");

        // Travel 31 days
        await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]);
        await ethers.provider.send("evm_mine", []);

        await expect(staking.connect(user1).unstake(tokenId)).to.emit(staking, "Unstaked");
    });
}); 