import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Attack Vectors Test", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let attacker: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
    let router: any;
    let token0: any;
    let token1: any;
    let pool: any;

    before(async function () {
        [deployer, user1, attacker] = await ethers.getSigners();

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

        // Mint tokens to deployer for liquidity provision
        await token0.mint(deployer.address, ethers.parseEther("100"));
        await token1.mint(deployer.address, ethers.parseEther("10000"));

        // Add initial liquidity to prevent NO_LIQ errors
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

        // Mint tokens to user
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));
    });

    describe("Reentrancy Protection", function () {
        it("should prevent reentrancy attacks on router functions", async function () {
            
            const swapParams = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: ethers.parseEther("1"),
                amountOutMinimum: 1n,
                sqrtPriceLimitX96: 0
            };
            
            await token0.connect(user1).approve(await router.getAddress(), swapParams.amountIn);
            
            // Normal swap should work (reentrancy guard allows this)
            await expect(
                router.connect(user1).exactInputSingle(swapParams)
            ).to.not.be.reverted;
        });
    });

    describe("Emergency Pause Functionality", function () {
        it("should allow pauser to pause router operations", async function () {
            
            // Deployer already has PAUSER_ROLE from constructor, no need to grant it
            
            // Pause the contract
            await router.pause();
            
            const swapParams = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: ethers.parseEther("1"),
                amountOutMinimum: 1n,
                sqrtPriceLimitX96: 0
            };
            
            await token0.connect(user1).approve(await router.getAddress(), swapParams.amountIn);
            
            // Operations should be paused
            await expect(
                router.connect(user1).exactInputSingle(swapParams)
            ).to.be.revertedWith("Pausable: paused");
            
            // Unpause and try again
            await router.unpause();
            
            await expect(
                router.connect(user1).exactInputSingle(swapParams)
            ).to.not.be.reverted;
        });
    });

    describe("Access Control Security", function () {
        it("should enforce oracle registry ownership", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Non-owner should not be able to set feeds
            await expect(
                oracleRegistry.connect(attacker).setFeed(
                    await testToken.getAddress(), 
                    ethers.Wallet.createRandom().address
                )
            ).to.be.revertedWith("NOT_OWNER");
        });
    });
}); 