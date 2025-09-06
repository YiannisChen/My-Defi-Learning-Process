import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RubySwapRouter Exact Input - Default Price Limit", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;

    let factory: any;
    let router: any;
    let positionManager: any;
    let token0: any;
    let token1: any;
    let pool: any;
    let timelock: any;

    beforeEach(async function () {
        [deployer, user1] = await ethers.getSigners();

        // Timelock
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        timelock = await RubySwapTimelock.deploy(
            [deployer.address],
            [deployer.address],
            deployer.address
        );
        await timelock.waitForDeployment();

        // Factory
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        // Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "TK0", 18);
        token1 = await MockERC20.deploy("Token1", "TK1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();

        if ((await token0.getAddress()) > (await token1.getAddress())) {
            [token0, token1] = [token1, token0];
        }

        // Oracle feeds on factory's registry
        const oracleRegistryAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const token0Feed = await MockAggregatorV3.deploy(200000000000);
        const token1Feed = await MockAggregatorV3.deploy(100000000);
        await token0Feed.waitForDeployment();
        await token1Feed.waitForDeployment();
        await oracleRegistry.setFeed(token0.target, token0Feed.target);
        await oracleRegistry.setFeed(token1.target, token1Feed.target);

        // Pool
        await factory.createPool(token0.target, token1.target, 3000);
        const poolAddress = await factory.getPool(token0.target, token1.target, 3000);
        pool = await ethers.getContractAt("RubySwapPool", poolAddress);
        await pool.initialize("79228162514264337593543950336"); // 1:1

        // Position Manager
        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            factory.target,
            ethers.ZeroAddress,
            "RubySwap V3 Positions",
            "RUBY-V3-POS"
        );
        await positionManager.waitForDeployment();

        // Router
        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        // Liquidity
        await token0.mint(deployer.address, ethers.parseEther("100"));
        await token1.mint(deployer.address, ethers.parseEther("100"));
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
            recipient: await deployer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 3600
        };
        await token0.approve(await positionManager.getAddress(), mintParams.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams.amount1Desired);
        await positionManager.mint(mintParams);

        // User balances and approvals
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10"));
        await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
        await token1.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
    });

    it("uses MIN_SQRT_RATIO when zeroForOne and price limit is 0", async function () {
        // token0 -> token1 (zeroForOne = true)
        const params = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 3600,
            amountIn: ethers.parseEther("1"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0
        };
        const before = await token1.balanceOf(user1.address);
        await expect(router.connect(user1).exactInputSingle(params)).to.not.be.reverted;
        const after = await token1.balanceOf(user1.address);
        expect(after - before).to.be.gt(0n);
    });

    it("uses MAX_SQRT_RATIO when !zeroForOne and price limit is 0", async function () {
        // token1 -> token0 (!zeroForOne)
        const params = {
            tokenIn: await token1.getAddress(),
            tokenOut: await token0.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 3600,
            amountIn: ethers.parseEther("1"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0
        };
        const before = await token0.balanceOf(user1.address);
        await expect(router.connect(user1).exactInputSingle(params)).to.not.be.reverted;
        const after = await token0.balanceOf(user1.address);
        expect(after - before).to.be.gt(0n);
    });
}); 