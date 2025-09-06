import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapRouter - Reentrancy negatives", function () {
    it("multicall -> exactInputSingle re-enters and reverts", async () => {
        const [deployer] = await ethers.getSigners();

        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        const router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        const params = {
            tokenIn: ethers.ZeroAddress,
            tokenOut: ethers.ZeroAddress,
            fee: 3000,
            recipient: deployer.address,
            deadline: Math.floor(Date.now() / 1000) + 3600,
            amountIn: ethers.parseEther("1"),
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0,
        };

        const data: string[] = [
            (router as any).interface.encodeFunctionData("exactInputSingle", [params]),
        ];

        await expect(router.multicall(data)).to.be.reverted;
    });

    it("multicall -> exactOutputSingle re-enters and reverts", async () => {
        const [deployer] = await ethers.getSigners();

        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        const router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        const params = {
            tokenIn: ethers.ZeroAddress,
            tokenOut: ethers.ZeroAddress,
            fee: 3000,
            recipient: deployer.address,
            deadline: Math.floor(Date.now() / 1000) + 3600,
            amountOut: ethers.parseEther("1"),
            amountInMaximum: ethers.MaxUint256,
            sqrtPriceLimitX96: 0,
        };

        const data: string[] = [
            (router as any).interface.encodeFunctionData("exactOutputSingle", [params]),
        ];

        await expect(router.multicall(data)).to.be.reverted;
    });

    it("multicall -> refundETH re-enters and reverts", async () => {
        const [deployer] = await ethers.getSigners();

        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        const router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        const data: string[] = [
            (router as any).interface.encodeFunctionData("refundETH", []),
        ];

        await expect(router.multicall(data)).to.be.reverted;
    });
}); 