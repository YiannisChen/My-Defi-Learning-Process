import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapPool - Owner actions lock", function () {
    it("blocks reentrancy during collectProtocol via token transfer hook", async () => {
        const [deployer] = await ethers.getSigners();

        // Deploy timelock + factory
        const Timelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await Timelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const Factory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await Factory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        // Deploy reentrant tokens and mint
        const Reentrant = await ethers.getContractFactory("ReentrantERC20");
        const token0 = await Reentrant.deploy("R0", "R0", 18);
        const token1 = await Reentrant.deploy("R1", "R1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();
        await token0.mint(deployer.address, ethers.parseEther("10"));
        await token1.mint(deployer.address, ethers.parseEther("10"));

        // Set oracle feeds so factory will allow pool creation
        const oracleAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracle = OracleRegistry.attach(oracleAddr);
        const Feed = await ethers.getContractFactory("MockAggregatorV3");
        const feed0 = await Feed.deploy(200000000000);
        const feed1 = await Feed.deploy(100000000);
        await feed0.waitForDeployment();
        await feed1.waitForDeployment();
        await oracle.setFeed(await token0.getAddress(), await feed0.getAddress());
        await oracle.setFeed(await token1.getAddress(), await feed1.getAddress());

        // Create pool and initialize
        await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
        await pool.initialize("79228162514264337593543950336");

        // Provide minimal liquidity via PositionManager
        const PM = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PM.deploy(factory.target, ethers.ZeroAddress, "RubySwap V3 Positions", "RUBY-V3-POS");
        await pm.waitForDeployment();
        await token0.approve(await pm.getAddress(), ethers.parseEther("10"));
        await token1.approve(await pm.getAddress(), ethers.parseEther("10"));
        await pm.mint({
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("1"),
            amount1Desired: ethers.parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: deployer.address,
            deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
        });

        // Set protocol fee and perform swaps to accrue protocol fees on at least one token
        await pool.setFeeProtocol(4, 4);
        const Router = await ethers.getContractFactory("RubySwapRouter");
        const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();
        await token0.approve(await router.getAddress(), ethers.MaxUint256);
        await token1.approve(await router.getAddress(), ethers.MaxUint256);
        // Swap token0->token1
        await router.exactInputSingle({
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: deployer.address,
            deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
            amountIn: ethers.parseEther("0.5"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0,
        });
        // Swap token1->token0
        await router.exactInputSingle({
            tokenIn: await token1.getAddress(),
            tokenOut: await token0.getAddress(),
            fee: 3000,
            recipient: deployer.address,
            deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
            amountIn: ethers.parseEther("0.5"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0,
        });

        // Determine which side accrued fees and arm corresponding token for reentrancy
        const fees = await pool.protocolFees();
        const request0 = (fees.token0 > 0n) ? 1 : 0;
        const request1 = (fees.token1 > 0n) ? 1 : 0;
        if (request0 === 1) {
            await token0.setReentrancyTarget(poolAddr, true);
        } else if (request1 === 1) {
            await token1.setReentrancyTarget(poolAddr, true);
        }

        // Attempt to collect protocol fees; ensure reentrancy attempt did not succeed
        await pool.collectProtocol(deployer.address, request0 as any, request1 as any);
        const successFlag = (request0 === 1)
            ? await token0.reenterSuccess()
            : (request1 === 1)
                ? await token1.reenterSuccess()
                : false;
        expect(successFlag).to.equal(false);
    });
}); 