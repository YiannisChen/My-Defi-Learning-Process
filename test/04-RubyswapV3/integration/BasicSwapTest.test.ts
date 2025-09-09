import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Basic Swap Test", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
    let router: any;
    let token0: any;
    let token1: any;
    let pool: any;

    beforeEach(async function () {
        [deployer, user1] = await ethers.getSigners();

        // Deploy Timelock first
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy(
            [deployer.address], // proposers
            [deployer.address], // executors
            deployer.address    // admin
        );
        await timelock.waitForDeployment();

        // Deploy Factory with timelock address
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        // Get the factory's oracle registry
        const oracleRegistryAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);

        // Deploy tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "TK0", 18);
        token1 = await MockERC20.deploy("Token1", "TK1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();

        // Ensure proper ordering
        if ((await token0.getAddress()) > (await token1.getAddress())) {
            [token0, token1] = [token1, token0];
        }

        // Deploy Position Manager
        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            factory.target,
            ethers.ZeroAddress, // WETH9 (not needed for tests)
            "RubySwap V3 Positions",
            "RUBY-V3-POS"
        );
        await positionManager.waitForDeployment();

        // Deploy Router
        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        // Set up mock oracle feeds on the factory's oracle registry
        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const token0Feed = await MockAggregatorV3.deploy(200000000000);  // $2000 with 8 decimals
        const token1Feed = await MockAggregatorV3.deploy(100000000);     // $1 with 8 decimals
        await token0Feed.waitForDeployment();
        await token1Feed.waitForDeployment();

        await oracleRegistry.setFeed(token0.target, token0Feed.target);
        await oracleRegistry.setFeed(token1.target, token1Feed.target);

        // Create pool
        await factory.createPool(token0.target, token1.target, 3000);
        const poolAddress = await factory.getPool(token0.target, token1.target, 3000);
        pool = await ethers.getContractAt("RubySwapPool", poolAddress);

        // Initialize pool
        await pool.initialize("79228162514264337593543950336"); // 1:1 price

        // Mint tokens to deployer for liquidity provision
        await token0.mint(deployer.address, ethers.parseEther("100"));
        await token1.mint(deployer.address, ethers.parseEther("10000"));

        // Mint tokens to user
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));
    });

    it("should add liquidity and perform a basic swap", async function () {
        // Step 1: Add liquidity
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
            recipient: await deployer.getAddress(),
            deadline: now + 300
        };
        
        await token0.approve(await positionManager.getAddress(), mintParams.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams.amount1Desired);
        
        const mintTx = await positionManager.mint(mintParams);
        await mintTx.wait();
        
        // Verify liquidity was added by checking pool liquidity
        const liquidity = await pool.liquidity();
        expect(liquidity).to.be.gt(0);
        
        // Step 2: Perform a swap
        const swapParams = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: now + 300,
            amountIn: ethers.parseEther("0.1"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0
        };
        
        await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
        
        const balanceBefore = await token1.balanceOf(await user1.getAddress());
        
        await router.connect(user1).exactInputSingle(swapParams);
        
        const balanceAfter = await token1.balanceOf(await user1.getAddress());
        expect(balanceAfter).to.be.gt(balanceBefore);
    });
}); 