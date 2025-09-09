import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Router Callback Debug", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
    let router: any;
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

        // Deploy Router
        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(factory.target, ethers.ZeroAddress);
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

        // Mint tokens to user
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));
    });

    it("should debug router callback step by step", async function () {
        console.log("\n=== ROUTER CALLBACK DEBUG START ===");
        
        // Step 1: Check user balances and allowances
        const token0Balance = await token0.balanceOf(await user1.getAddress());
        const token1Balance = await token1.balanceOf(await user1.getAddress());
        console.log("User1 token0 balance:", ethers.formatEther(token0Balance));
        console.log("User1 token1 balance:", ethers.formatEther(token1Balance));
        
        // Step 2: Approve router
        const swapAmount = ethers.parseEther("0.1");
        await token0.connect(user1).approve(await router.getAddress(), swapAmount);
        
        const allowance = await token0.allowance(await user1.getAddress(), await router.getAddress());
        console.log("Router allowance:", ethers.formatEther(allowance));
        
        // Step 3: Try the swap with detailed logging
        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const swapParams = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: now + 3600,
            amountIn: swapAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };
        
        console.log("Attempting router swap...");
        
        try {
            const tx = await router.connect(user1).exactInputSingle(swapParams);
            const receipt = await tx.wait();
            console.log("✅ Router swap succeeded!");
            console.log("Gas used:", receipt.gasUsed.toString());
            
        } catch (error: any) {
            console.log("❌ Router swap failed:", error.message);
            console.log("This confirms the callback/approval issue from the directive");
        }
        
        console.log("=== ROUTER CALLBACK DEBUG END ===\n");
    });
}); 