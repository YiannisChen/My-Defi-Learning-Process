import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RubySwapPool Protocol Fees - Simple Test", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let pool: any;
    let timelock: any;

    beforeEach(async function () {
        [deployer, user1] = await ethers.getSigners();

        // Deploy Timelock first
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        timelock = await RubySwapTimelock.deploy(
            [deployer.address], // proposers
            [deployer.address], // executors
            deployer.address    // admin
        );
        await timelock.waitForDeployment();

        // Deploy Factory with timelock address
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        // Deploy tokens for pool creation
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const token0 = await MockERC20.deploy("Token0", "TK0", 18);
        const token1 = await MockERC20.deploy("MockERC20", "TK1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();

        // Ensure proper ordering
        const [tokenA, tokenB] = (await token0.getAddress()) < (await token1.getAddress()) 
            ? [token0, token1] 
            : [token1, token0];

        // Get the factory's oracle registry
        const oracleRegistryAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);

        // Set up mock oracle feeds
        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const token0Feed = await MockAggregatorV3.deploy(200000000000);  // $2000 with 8 decimals
        const token1Feed = await MockAggregatorV3.deploy(100000000);     // $1 with 8 decimals
        await token0Feed.waitForDeployment();
        await token1Feed.waitForDeployment();

        await oracleRegistry.setFeed(tokenA.target, token0Feed.target);
        await oracleRegistry.setFeed(tokenB.target, token1Feed.target);

        // Create pool using factory
        await factory.createPool(tokenA.target, tokenB.target, 3000);
        const poolAddress = await factory.getPool(tokenA.target, tokenB.target, 3000);
        pool = await ethers.getContractAt("RubySwapPool", poolAddress);

        // Initialize pool
        await pool.initialize("79228162514264337593543950336"); // 1:1 price
        
        // Deploy position manager for liquidity provision
        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        const positionManager = await RubySwapPositionManager.deploy(
            factory.target,
            ethers.ZeroAddress, // WETH9 (not needed for tests)
            "RubySwap V3 Positions",
            "RUBY-V3-POS"
        );
        await positionManager.waitForDeployment();
        
        // Add some liquidity to the pool so it's not empty
        const mintParams = {
            token0: await tokenA.getAddress(),
            token1: await tokenB.getAddress(),
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
        
        // Mint tokens to deployer for liquidity provision
        await tokenA.mint(deployer.address, ethers.parseEther("10"));
        await tokenB.mint(deployer.address, ethers.parseEther("10"));
        
        // Approve position manager
        await tokenA.approve(await positionManager.getAddress(), ethers.parseEther("10"));
        await tokenB.approve(await positionManager.getAddress(), ethers.parseEther("10"));
        
        // Add liquidity
        await positionManager.mint(mintParams);
    });

    describe("Basic Protocol Fee Test", function () {
        it("should allow setting protocol fees", async function () {
            await pool.setFeeProtocol(5, 4);
            const feeProtocol = await pool.feeProtocol();
            expect(feeProtocol % 16n).to.equal(5n);
            expect(feeProtocol >> 4n).to.equal(4n);
        });

        it("should reject invalid protocol fee values", async function () {
            await expect(pool.setFeeProtocol(2, 3)).to.be.revertedWith("Invalid fee");
            await expect(pool.setFeeProtocol(4, 11)).to.be.revertedWith("Invalid fee");
        });
    });

    describe("Protocol Fee Accrual and Collection", function () {
        it("accrues protocol fees during swaps and collects them (with slot not cleared)", async function () {
            await pool.setFeeProtocol(5, 5);

            const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
            const router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
            await router.waitForDeployment();

            const token0Addr = await pool.token0();
            const token1Addr = await pool.token1();
            const token0 = await ethers.getContractAt("MockERC20", token0Addr);
            const token1 = await ethers.getContractAt("MockERC20", token1Addr);

            const [, user1Signer] = await ethers.getSigners();
            await token0.mint(user1Signer.address, ethers.parseEther("5"));
            await token1.mint(user1Signer.address, ethers.parseEther("5"));
            await token0.connect(user1Signer).approve(await router.getAddress(), ethers.MaxUint256);
            await token1.connect(user1Signer).approve(await router.getAddress(), ethers.MaxUint256);

            const paramsIn0 = {
                tokenIn: token0Addr,
                tokenOut: token1Addr,
                fee: 3000,
                recipient: user1Signer.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: ethers.parseEther("1"),
                amountOutMinimum: 1n,
                sqrtPriceLimitX96: 0
            };
            await router.connect(user1Signer).exactInputSingle(paramsIn0);

            const paramsIn1 = {
                tokenIn: token1Addr,
                tokenOut: token0Addr,
                fee: 3000,
                recipient: user1Signer.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: ethers.parseEther("1"),
                amountOutMinimum: 1n,
                sqrtPriceLimitX96: 0
            };
            await router.connect(user1Signer).exactInputSingle(paramsIn1);

            const protocolFeesBefore = await pool.protocolFees();
            expect(protocolFeesBefore.token0 + protocolFeesBefore.token1).to.be.gt(0n);

            const recipient = await deployer.getAddress();
            const tx = await pool.collectProtocol(recipient, protocolFeesBefore.token0, protocolFeesBefore.token1);
            await tx.wait();

            const protocolFeesAfter = await pool.protocolFees();
            expect(protocolFeesAfter.token0).to.be.lte(1n);
            expect(protocolFeesAfter.token1).to.be.lte(1n);
        });
    });

    it("increases observationCardinalityNext via grow path", async function () {
        const before = await pool.observationCardinalityNext();
        await pool.increaseObservationCardinalityNext(16);
        const after = await pool.observationCardinalityNext();
        expect(after).to.be.greaterThan(before);
    });
}); 