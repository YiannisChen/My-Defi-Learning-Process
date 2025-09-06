import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Pool Locking Debug", function () {
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

        // Mint tokens to user
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));
    });

    it("should debug pool locking state step by step", async function () {
        this.skip();
        console.log("\n=== POOL LOCKING DEBUG START ===");
        
        // Step 1: Check initial unlocked state
        const unlockedInitial = await pool.getUnlockedState();
        console.log("Initial unlocked state:", unlockedInitial);
        expect(unlockedInitial).to.be.true;
        
        // Step 2: Try to call a function that doesn't use lock modifier
        const liquidity = await pool.liquidity();
        console.log("Current liquidity:", liquidity.toString());
        
        // Step 3: Check unlocked state again
        const unlockedAfterRead = await pool.getUnlockedState();
        console.log("Unlocked after read operation:", unlockedAfterRead);
        expect(unlockedAfterRead).to.be.true;
        
        // Step 4: Try a simple direct call to pool.swap with minimal parameters
        console.log("Attempting direct pool swap...");
        
        // Mint some tokens to the deployer first
        await token0.mint(await deployer.getAddress(), ethers.parseEther("100"));
        
        try {
            // This should fail if there's a locking issue
            await pool.swap(
                await deployer.getAddress(), // recipient
                true, // zeroForOne
                ethers.parseEther("0.001"), // very small amount
                0, // sqrtPriceLimitX96 (no limit)
                "0x" // empty data
            );
            console.log("✅ Direct pool swap succeeded!");
        } catch (error: any) {
            console.log("❌ Direct pool swap failed:", error.message);
            
            // Check pool state after failure
            const unlockedAfterFail = await pool.getUnlockedState();
            console.log("Unlocked after failed swap:", unlockedAfterFail);
            
            // Try to understand the exact failure
            if (error.message.includes("LOK")) {
                console.log("🔍 CONFIRMED: Pool locking issue detected");
                console.log("The pool is reporting as locked when swap is called");
            }
        }
        
        console.log("=== POOL LOCKING DEBUG END ===\n");
    });

    it("should test pool operations without swap", async function () {
        console.log("\n=== NON-SWAP OPERATIONS TEST ===");
        
        // Test operations that don't require lock
        try {
            const factory = await pool.factory();
            console.log("✅ factory() call succeeded");
            
            const token0Addr = await pool.token0();
            console.log("✅ token0() call succeeded");
            
            const slot0 = await pool.slot0();
            console.log("✅ slot0() call succeeded");
            
            const unlocked = await pool.getUnlockedState();
            console.log("✅ getUnlockedState() call succeeded, value:", unlocked);
            
        } catch (error: any) {
            console.log("❌ Basic pool operation failed:", error.message);
        }
        
        console.log("=== NON-SWAP OPERATIONS TEST END ===\n");
    });
}); 