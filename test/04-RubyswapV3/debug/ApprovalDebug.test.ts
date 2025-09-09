import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Approval Debug", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
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

    it("should debug approval flow step by step", async function () {
        console.log("=== APPROVAL DEBUG START ===");
        
        const amount0 = ethers.parseEther("1");
        const amount1 = ethers.parseEther("1000");
        
        // Check initial balances
        const balance0 = await token0.balanceOf(user1.address);
        const balance1 = await token1.balanceOf(user1.address);
        console.log("User token0 balance:", ethers.formatEther(balance0));
        console.log("User token1 balance:", ethers.formatEther(balance1));
        
        // Check initial allowances
        const allowance0Before = await token0.allowance(user1.address, positionManager.target);
        const allowance1Before = await token1.allowance(user1.address, positionManager.target);
        console.log("Initial token0 allowance:", ethers.formatEther(allowance0Before));
        console.log("Initial token1 allowance:", ethers.formatEther(allowance1Before));
        
        // Approve tokens
        console.log("Approving tokens...");
        await token0.connect(user1).approve(positionManager.target, amount0);
        await token1.connect(user1).approve(positionManager.target, amount1);
        
        // Check allowances after approval
        const allowance0After = await token0.allowance(user1.address, positionManager.target);
        const allowance1After = await token1.allowance(user1.address, positionManager.target);
        console.log("After approval token0 allowance:", ethers.formatEther(allowance0After));
        console.log("After approval token1 allowance:", ethers.formatEther(allowance1After));
        
        // Verify approvals are sufficient
        expect(allowance0After).to.be.gte(amount0);
        expect(allowance1After).to.be.gte(amount1);
        
        console.log("✅ Approvals verified");
        
        // Try to mint position
        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const mintParams = {
            token0: token0.target,
            token1: token1.target,
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
            recipient: user1.address,
            deadline: now + 3600
        };
        
        console.log("Attempting to mint position...");
        
        try {
            const mintTx = await positionManager.connect(user1).mint(mintParams);
            await mintTx.wait();
            console.log("✅ Position minted successfully!");
        } catch (error: any) {
            console.log("❌ Position mint failed:", error.message);
            throw error;
        }
        
        console.log("=== APPROVAL DEBUG END ===");
    });
}); 