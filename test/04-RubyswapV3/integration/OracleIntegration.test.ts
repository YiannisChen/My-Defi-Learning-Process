import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Oracle Integration Test", function () {
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

    describe("Chainlink Feed Requirements", function () {
        it("should enforce Chainlink feed requirement for pool creation", async function () {
            // Deploy new tokens without feeds
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const tokenWithoutFeed = await MockERC20.deploy("TokenWithoutFeed", "TWF", 18);
            await tokenWithoutFeed.waitForDeployment();
            
            const tokenWithFeed = await MockERC20.deploy("TokenWithFeed", "TWF2", 18);
            await tokenWithFeed.waitForDeployment();
            
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            // Set feed for only one token
            await oracleRegistry.setFeed(
                await tokenWithFeed.getAddress(), 
                ethers.Wallet.createRandom().address
            );
            
            // Should fail when one token lacks a feed
            await expect(
                factory.createPool(
                    await tokenWithoutFeed.getAddress(), 
                    await tokenWithFeed.getAddress(), 
                    3000
                )
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
            
            // Should succeed when both tokens have feeds
            await oracleRegistry.setFeed(
                await tokenWithoutFeed.getAddress(), 
                ethers.Wallet.createRandom().address
            );
            
            await expect(
                factory.createPool(
                    await tokenWithoutFeed.getAddress(), 
                    await tokenWithFeed.getAddress(), 
                    3000
                )
            ).to.not.be.reverted;
        });

        it("should validate feed data during feed setup", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Deploy mock aggregator with valid data
            const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
            const validAggregator = await MockAggregator.deploy(100000000); // $1 with 8 decimals
            await validAggregator.waitForDeployment();
            
            // Should succeed with valid aggregator
            await expect(
                oracleRegistry.setFeed(await testToken.getAddress(), await validAggregator.getAddress())
            ).to.not.be.reverted;
            
            // Check feed info
            const [feedAddress, decimals, enabled, lastUpdate] = await oracleRegistry.getFeedInfo(
                await testToken.getAddress()
            );
            
            expect(feedAddress).to.equal(await validAggregator.getAddress());
            expect(decimals).to.equal(8);
            expect(enabled).to.be.true;
            expect(lastUpdate).to.be.gt(0);
        });

        it("should handle price normalization correctly", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Deploy aggregator with 8 decimals (typical for Chainlink)
            const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
            const aggregator = await MockAggregator.deploy(100000000); // $1 with 8 decimals
            await aggregator.waitForDeployment();
            
            await oracleRegistry.setFeed(await testToken.getAddress(), await aggregator.getAddress());
            
            // Get normalized price (should be 18 decimals)
            const [price, isValid] = await oracleRegistry.getPrice(await testToken.getAddress());
            
            expect(isValid).to.be.true;
            expect(price).to.equal(ethers.parseEther("1")); // Should be normalized to 18 decimals
        });
    });

    describe("Safe Mode and Price Deviation", function () {
        it("should detect price deviation and return safe mode status", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Deploy mock aggregator
            const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
            const aggregator = await MockAggregator.deploy(100000000); // $1 with 8 decimals
            await aggregator.waitForDeployment();
            
            await oracleRegistry.setFeed(await testToken.getAddress(), await aggregator.getAddress());
            
            // Check safe price status with a TWAP price
            const twapPrice = 2n ** 96n; // 1:1 price in Q64.96 format
            const [isSafe, deviation] = await oracleRegistry.isSafePrice(await testToken.getAddress(), twapPrice);
            expect(isSafe).to.be.true; // Should be safe for normal price
        });

        it("should handle feed updates correctly", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Deploy mock aggregator
            const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
            const aggregator = await MockAggregator.deploy(100000000); // $1 with 8 decimals
            await aggregator.waitForDeployment();
            
            await oracleRegistry.setFeed(await testToken.getAddress(), await aggregator.getAddress());
            
            // Check that feed is set
            const hasFeed = await oracleRegistry.hasFeed(await testToken.getAddress());
            expect(hasFeed).to.be.true;
        });
    });

    describe("Feed Management", function () {
        it("should allow disabling feeds", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Deploy mock aggregator
            const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
            const aggregator = await MockAggregator.deploy(100000000); // $1 with 8 decimals
            await aggregator.waitForDeployment();
            
            await oracleRegistry.setFeed(await testToken.getAddress(), await aggregator.getAddress());
            
            // Disable the feed with a reason
            await oracleRegistry.disableFeed(await testToken.getAddress(), "Testing disable");
            
            // Check that feed is disabled
            const hasFeed = await oracleRegistry.hasFeed(await testToken.getAddress());
            expect(hasFeed).to.be.false;
        });

        it("should validate feed addresses", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const testToken = await MockERC20.deploy("TestToken", "TT", 18);
            await testToken.waitForDeployment();
            
            // Try to set invalid feed address
            await expect(
                oracleRegistry.setFeed(await testToken.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWith("ZERO_ADDRESS");
        });
    });

    describe("Integration with Pool Creation", function () {
        it("should prevent pool creation without proper oracle feeds", async function () {
            // Deploy tokens without setting up oracle feeds
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const token1 = await MockERC20.deploy("Token1", "T1", 18);
            const token2 = await MockERC20.deploy("Token2", "T2", 18);
            await token1.waitForDeployment();
            await token2.waitForDeployment();
            
            // Should fail to create pool without oracle feeds
            await expect(
                factory.createPool(await token1.getAddress(), await token2.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
        });

        it("should create pools successfully when oracle requirements are met", async function () {
            // Get the factory's oracle registry
            const oracleRegistryAddr = await factory.oracleRegistry();
            const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
            const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
            
            // Deploy tokens and set up oracle feeds
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const token1 = await MockERC20.deploy("Token1", "T1", 18);
            const token2 = await MockERC20.deploy("Token2", "T2", 18);
            await token1.waitForDeployment();
            await token2.waitForDeployment();
            
            // Set up oracle feeds
            await oracleRegistry.setFeed(
                await token1.getAddress(), 
                ethers.Wallet.createRandom().address
            );
            await oracleRegistry.setFeed(
                await token2.getAddress(), 
                ethers.Wallet.createRandom().address
            );
            
            // Should succeed in creating pool
            const tx = await factory.createPool(
                await token1.getAddress(), 
                await token2.getAddress(), 
                3000
            );
            
            const receipt = await tx.wait();
            
            // Verify pool was created
            const poolAddress = await factory.getPool(
                await token1.getAddress(), 
                await token2.getAddress(), 
                3000
            );
            
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);
        });
    });
}); 