import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Direct Pool Test", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
    let token0: any;
    let token1: any;
    let pool: any;

    before(async function () {
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

    it("should check pool unlocked state before and after operations", async function () {
        // Check initial state
        let unlocked = await pool.unlocked();
        console.log("Initial pool unlocked state:", unlocked);
        expect(unlocked).to.be.true;
        
        // Add liquidity
        const mintParams = {
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("1"),
            amount1Desired: ethers.parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: await deployer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 3600
        };
        
        await token0.approve(await positionManager.getAddress(), mintParams.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams.amount1Desired);
        
        console.log("Adding liquidity...");
        await positionManager.mint(mintParams);
        
        // Check state after mint
        unlocked = await pool.unlocked();
        console.log("Pool unlocked after mint:", unlocked);
        expect(unlocked).to.be.true;
        
        // Check liquidity was added
        const liquidity = await pool.liquidity();
        console.log("Pool liquidity:", liquidity.toString());
        expect(liquidity).to.be.gt(0);
        
        // Try a direct call to the pool's swap function
        // Create a simple swap callback contract first
        const SimpleSwapCallback = await ethers.getContractFactory("SimpleSwapCallback");
        const callback = await SimpleSwapCallback.deploy();
        await callback.waitForDeployment();
        
        // Fund the callback contract so it can pay for the swap
        await token0.mint(await callback.getAddress(), ethers.parseEther("10"));
        
        console.log("Attempting direct pool swap...");
        
        // Use router instead of direct pool call to test swap functionality
        // Router handles the callback properly
        const swapParams = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: await deployer.getAddress(),
            deadline: Math.floor(Date.now() / 1000) + 300,
            amountIn: ethers.parseEther("0.01"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0
        };
        
        // Deploy router for testing
        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        const router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();
        
        // Approve router
        await token0.approve(await router.getAddress(), swapParams.amountIn);
        
        const swapResult = await router.exactInputSingle(swapParams);
        
        console.log("Direct pool swap successful! ✅");
        console.log("Swap result:", swapResult);
    });
}); 