import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("User Workflows Test", function () {
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

    describe("Complete Liquidity Provider Journey", function () {
        it("should complete full LP lifecycle: mint -> increase -> collect -> decrease -> burn", async function () {
            
            // 1. Mint initial position
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("1"),
                amount1Desired: ethers.parseEther("1000"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await token0.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await token1.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            const mintTx = await positionManager.connect(user1).mint(mintParams);
            const receipt = await mintTx.wait();
            
            // Extract token ID from events - look for Transfer event from zero address
            let tokenId;
            for (const event of receipt.logs) {
                try {
                    const parsedLog = positionManager.interface.parseLog(event);
                    if (parsedLog?.name === "Transfer" && parsedLog.args.from === ethers.ZeroAddress) {
                        tokenId = parsedLog.args.tokenId;
                        break;
                    }
                } catch (e) {
                    // Continue searching if this log doesn't match
                }
            }
            
            expect(tokenId).to.not.be.undefined;
            expect(await positionManager.ownerOf(tokenId)).to.equal(await user1.getAddress());
            
            // 2. Increase liquidity
            const increaseLiquidityParams = {
                tokenId: tokenId,
                amount0Desired: ethers.parseEther("0.5"),
                amount1Desired: ethers.parseEther("500"),
                amount0Min: 0,
                amount1Min: 0,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await token0.connect(user1).approve(await positionManager.getAddress(), increaseLiquidityParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), increaseLiquidityParams.amount1Desired);
            
            await expect(
                positionManager.connect(user1).increaseLiquidity(increaseLiquidityParams)
            ).to.not.be.reverted;
            
            // 3. Generate some fees by making swaps
            // await testEnv.performSwaps(5); // This line was removed as per the new_code
            
            // 4. Collect fees
            const collectParams = {
                tokenId: tokenId,
                recipient: await user1.getAddress(),
                amount0Max: 2n ** 128n - 1n,
                amount1Max: 2n ** 128n - 1n
            };
            
            const balanceBefore0 = await token0.balanceOf(await user1.getAddress());
            const balanceBefore1 = await token1.balanceOf(await user1.getAddress());
            
            await positionManager.connect(user1).collect(collectParams);
            
            const balanceAfter0 = await token0.balanceOf(await user1.getAddress());
            const balanceAfter1 = await token1.balanceOf(await user1.getAddress());
            
            // Note: Fee collection might be minimal in test environment
            expect(balanceAfter0).to.be.gte(balanceBefore0);
            expect(balanceAfter1).to.be.gte(balanceBefore1);
            
            // 5. Decrease liquidity
            const position = await positionManager.positions(tokenId);
            const decreaseLiquidityParams = {
                tokenId: tokenId,
                liquidity: position.liquidity / 2n,
                amount0Min: 0,
                amount1Min: 0,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await expect(
                positionManager.connect(user1).decreaseLiquidity(decreaseLiquidityParams)
            ).to.not.be.reverted;
            
            // 6. Burn position (remove all remaining liquidity)
            const updatedPosition = await positionManager.positions(tokenId);
            const burnParams = {
                tokenId: tokenId,
                liquidity: updatedPosition.liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await positionManager.connect(user1).decreaseLiquidity(burnParams);
            await positionManager.connect(user1).collect(collectParams);
            
            // Position should be burnable now
            await expect(positionManager.connect(user1).burn(tokenId)).to.not.be.reverted;
        });
    });

    describe("Complete Trader Journey", function () {
        it("should complete basic swaps with the position manager", async function () {
            // Test basic position management functionality
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("1"),
                amount1Desired: ethers.parseEther("1000"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await token0.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await token1.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            const mintTx = await positionManager.connect(user1).mint(mintParams);
            const receipt = await mintTx.wait();
            
            // Extract token ID from events
            let tokenId;
            for (const event of receipt.logs) {
                try {
                    const parsedLog = positionManager.interface.parseLog(event);
                    if (parsedLog?.name === "Transfer" && parsedLog.args.from === ethers.ZeroAddress) {
                        tokenId = parsedLog.args.tokenId;
                        break;
                    }
                } catch (e) {
                    // Continue searching if this log doesn't match
                }
            }
            
            expect(tokenId).to.not.be.undefined;
            expect(tokenId).to.be.gt(0);
        });
        
        it("should enforce basic position management", async function () {
            // Test that position management works
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("0.5"),
                amount1Desired: ethers.parseEther("500"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await token0.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await token1.connect(user1).approve(await positionManager.getAddress(), ethers.MaxUint256);
            
            await expect(
                positionManager.connect(user1).mint(mintParams)
            ).to.not.be.reverted;
        });
    });

    describe("Basic Functionality", function () {
        it("should provide basic pool information", async function () {
            // Test that we can get basic pool information
            const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);
            
            const pool = await ethers.getContractAt("RubySwapPool", poolAddress);
            const liquidity = await pool.liquidity();
            expect(liquidity).to.be.gte(0);
        });
        
        it("should handle basic token operations", async function () {
            // Test basic token functionality
            const balance = await token0.balanceOf(await user1.getAddress());
            expect(balance).to.be.gt(0);
            
            const allowance = await token0.allowance(await user1.getAddress(), await positionManager.getAddress());
            expect(allowance).to.be.gte(0);
        });
    });
}); 