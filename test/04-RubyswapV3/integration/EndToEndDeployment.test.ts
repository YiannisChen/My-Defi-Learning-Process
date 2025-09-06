import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, SignerWithAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RubySwap V3 End-to-End Deployment", function () {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let timelock: Contract;
    let factory: Contract;
    let oracleRegistry: Contract;
    let positionManager: Contract;
    let router: Contract;
    let weth9: Contract;
    let usdc: Contract;
    let usdt: Contract;
    let wethFeed: Contract;
    let usdcFeed: Contract;
    let usdtFeed: Contract;
    let ethUsdcPool: Contract;
    let ethUsdtPool: Contract;
    let usdcUsdtPool: Contract;

    async function deployFixture() {
        [deployer, user] = await ethers.getSigners();

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        weth9 = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        usdt = await MockERC20.deploy("Tether USD", "USDT", 6);

        // Deploy mock Chainlink feeds
        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        wethFeed = await MockAggregatorV3.deploy(200000000000n); // $2000 with 8 decimals
        usdcFeed = await MockAggregatorV3.deploy(100000000n); // $1.00 with 8 decimals
        usdtFeed = await MockAggregatorV3.deploy(100000000n); // $1.00 with 8 decimals

        // Deploy timelock
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        timelock = await RubySwapTimelock.deploy([], [], deployer.address);

        // Deploy factory
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());

        // Use factory's built-in oracle registry
        const registryAddr = await factory.oracleRegistry();
        oracleRegistry = await ethers.getContractAt("OracleRegistry", registryAddr);

        // Deploy position manager
        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            await factory.getAddress(),
            await weth9.getAddress(),
            "RubySwap V3",
            "RUBY-V3"
        );

        // Deploy router
        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(
            await factory.getAddress(),
            await weth9.getAddress()
        );

        // Setup oracle feeds
        await oracleRegistry.setFeed(await weth9.getAddress(), await wethFeed.getAddress());
        await oracleRegistry.setFeed(await usdc.getAddress(), await usdcFeed.getAddress());
        await oracleRegistry.setFeed(await usdt.getAddress(), await usdtFeed.getAddress());

        // Mint tokens to deployer for initial liquidity
        await weth9.mint(deployer.address, ethers.parseEther("1000"));
        await usdc.mint(deployer.address, 1000000000n); // 1000 USDC
        await usdt.mint(deployer.address, 1000000000n); // 1000 USDT

        // Mint tokens to user for testing
        await weth9.mint(user.address, ethers.parseEther("100"));
        await usdc.mint(user.address, 100000000n); // 100 USDC
        await usdt.mint(user.address, 100000000n); // 100 USDT

        return {
            deployer, user, timelock, factory, oracleRegistry, positionManager, router,
            weth9, usdc, usdt, wethFeed, usdcFeed, usdtFeed
        };
    }

    describe("Deployment Sequence", function () {
        it("should deploy all contracts successfully", async function () {
            const { timelock, factory, oracleRegistry, positionManager, router } = await loadFixture(deployFixture);

            expect(await timelock.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await factory.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await oracleRegistry.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await positionManager.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await router.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("should set correct addresses in contracts", async function () {
            const { factory, timelock, oracleRegistry, positionManager, router, weth9 } = await loadFixture(deployFixture);

            // Factory should have correct timelock
            expect(await factory.timelock()).to.equal(await timelock.getAddress());

            // Factory should have correct oracle registry
            expect(await factory.oracleRegistry()).to.equal(await oracleRegistry.getAddress());

            // Position manager should have correct factory and WETH
            expect(await positionManager.factory()).to.equal(await factory.getAddress());
            expect(await positionManager.WETH9()).to.equal(await weth9.getAddress());

            // Router should have correct factory and WETH
            expect(await router.factory()).to.equal(await factory.getAddress());
            expect(await router.WETH9()).to.equal(await weth9.getAddress());
        });

        it("should set up oracle feeds correctly", async function () {
            const { oracleRegistry, weth9, usdc, usdt, wethFeed, usdcFeed, usdtFeed } = await loadFixture(deployFixture);

            // Check that feeds are set
            expect(await oracleRegistry.getFeed(await weth9.getAddress())).to.equal(await wethFeed.getAddress());
            expect(await oracleRegistry.getFeed(await usdc.getAddress())).to.equal(await usdcFeed.getAddress());
            expect(await oracleRegistry.getFeed(await usdt.getAddress())).to.equal(await usdtFeed.getAddress());

            // Check that feeds are enabled via hasFeed()
            expect(await oracleRegistry.hasFeed(await weth9.getAddress())).to.be.true;
            expect(await oracleRegistry.hasFeed(await usdc.getAddress())).to.be.true;
            expect(await oracleRegistry.hasFeed(await usdt.getAddress())).to.be.true;
        });
    });

    describe("Pool Creation and Initialization", function () {
        it("should create ETH/USDC pool successfully", async function () {
            const { factory, weth9, usdc } = await loadFixture(deployFixture);

            await expect(
                factory.createPool(await weth9.getAddress(), await usdc.getAddress(), 3000)
            ).to.not.be.reverted;

            const poolAddress = await factory.getPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            ethUsdcPool = await ethers.getContractAt("RubySwapPool", poolAddress);
        });

        it("should create ETH/USDT pool successfully", async function () {
            const { factory, weth9, usdt } = await loadFixture(deployFixture);

            await expect(
                factory.createPool(await weth9.getAddress(), await usdt.getAddress(), 3000)
            ).to.not.be.reverted;

            const poolAddress = await factory.getPool(await weth9.getAddress(), await usdt.getAddress(), 3000);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            ethUsdtPool = await ethers.getContractAt("RubySwapPool", poolAddress);
        });

        it("should create USDC/USDT pool successfully", async function () {
            const { factory, usdc, usdt } = await loadFixture(deployFixture);

            await expect(
                factory.createPool(await usdc.getAddress(), await usdt.getAddress(), 500)
            ).to.not.be.reverted;

            const poolAddress = await factory.getPool(await usdc.getAddress(), await usdt.getAddress(), 500);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);

            usdcUsdtPool = await ethers.getContractAt("RubySwapPool", poolAddress);
        });

        it("should initialize pools with correct prices", async function () {
            const { factory, weth9, usdc, usdt } = await loadFixture(deployFixture);

            // Create pools
            await factory.createPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            await factory.createPool(await weth9.getAddress(), await usdt.getAddress(), 3000);
            await factory.createPool(await usdc.getAddress(), await usdt.getAddress(), 500);

            // Get pool contracts
            const ethUsdcAddr = await factory.getPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            const ethUsdtAddr = await factory.getPool(await weth9.getAddress(), await usdt.getAddress(), 3000);
            const usdcUsdtAddr = await factory.getPool(await usdc.getAddress(), await usdt.getAddress(), 500);

            const ethUsdc = await ethers.getContractAt("RubySwapPool", ethUsdcAddr);
            const ethUsdt = await ethers.getContractAt("RubySwapPool", ethUsdtAddr);
            const usdcUsdt = await ethers.getContractAt("RubySwapPool", usdcUsdtAddr);

            // Initialize all pools to 1:1 sqrt price
            const sqrtPrice = 79228162514264337593543950336n;
            await ethUsdc.initialize(sqrtPrice);
            await ethUsdt.initialize(sqrtPrice);
            await usdcUsdt.initialize(sqrtPrice);

            // Validate via sqrtPrice getter
            expect(await ethUsdc.sqrtPriceX96()).to.equal(sqrtPrice);
            expect(await ethUsdt.sqrtPriceX96()).to.equal(sqrtPrice);
            expect(await usdcUsdt.sqrtPriceX96()).to.equal(sqrtPrice);
        });
    });

    describe("Initial Liquidity Provision", function () {
        it("should add initial liquidity to ETH/USDC pool", async function () {
            const { deployer, factory, weth9, usdc, positionManager } = await loadFixture(deployFixture);

            // Create and initialize pool
            await factory.createPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            const poolAddr = await factory.getPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
            await pool.initialize(79228162514264337593543950336n);

            // Approve tokens
            await weth9.approve(await positionManager.getAddress(), ethers.MaxUint256);
            await usdc.approve(await positionManager.getAddress(), ethers.MaxUint256);

            // Add liquidity
            await positionManager.mint({
                token0: await weth9.getAddress(),
                token1: await usdc.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: 20000000n, // 20 USDC
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer.address,
                deadline: Math.floor(Date.now() / 1000) + 1800
            });

            // Check pool liquidity
            const liquidity = await pool.liquidity();
            expect(liquidity).to.be.gt(0);
        });

        it("should add initial liquidity to ETH/USDT pool", async function () {
            const { deployer, factory, weth9, usdt, positionManager } = await loadFixture(deployFixture);

            // Create and initialize pool
            await factory.createPool(await weth9.getAddress(), await usdt.getAddress(), 3000);
            const poolAddr = await factory.getPool(await weth9.getAddress(), await usdt.getAddress(), 3000);
            const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
            await pool.initialize(79228162514264337593543950336n);

            // Approve tokens
            await weth9.approve(await positionManager.getAddress(), ethers.MaxUint256);
            await usdt.approve(await positionManager.getAddress(), ethers.MaxUint256);

            // Add liquidity
            await positionManager.mint({
                token0: await weth9.getAddress(),
                token1: await usdt.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: 20000000n, // 20 USDT
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer.address,
                deadline: Math.floor(Date.now() / 1000) + 1800
            });

            // Check pool liquidity
            const liquidity = await pool.liquidity();
            expect(liquidity).to.be.gt(0);
        });

        it("should add initial liquidity to USDC/USDT pool", async function () {
            const { deployer, factory, usdc, usdt, positionManager } = await loadFixture(deployFixture);

            // Create and initialize pool
            await factory.createPool(await usdc.getAddress(), await usdt.getAddress(), 500);
            const poolAddr = await factory.getPool(await usdc.getAddress(), await usdt.getAddress(), 500);
            const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
            await pool.initialize(79228162514264337593543950336n);

            // Approve tokens
            await usdc.approve(await positionManager.getAddress(), ethers.MaxUint256);
            await usdt.approve(await positionManager.getAddress(), ethers.MaxUint256);

            // Add liquidity
            await positionManager.mint({
                token0: await usdc.getAddress(),
                token1: await usdt.getAddress(),
                fee: 500,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: 10000000n, // 10 USDC
                amount1Desired: 10000000n, // 10 USDT
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer.address,
                deadline: Math.floor(Date.now() / 1000) + 1800
            });

            // Check pool liquidity
            const liquidity = await pool.liquidity();
            expect(liquidity).to.be.gt(0);
        });
    });

    describe("Basic Swap Functionality", function () {
        it("should perform basic swap on ETH/DAI (both 18 decimals) pool", async function () {
            const { user, factory, weth9, router, positionManager } = await loadFixture(deployFixture);

            // Deploy DAI (18 decimals) and set mock feed
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
            const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
            const daiFeed = await MockAggregatorV3.deploy(100000000n);
            const registryAddr = await factory.oracleRegistry();
            const oracleRegistry = await ethers.getContractAt("OracleRegistry", registryAddr);
            await oracleRegistry.setFeed(await dai.getAddress(), await daiFeed.getAddress());
            // Fund user with DAI for providing liquidity
            await dai.mint(user.address, ethers.parseEther("1000"));

            // Create pool and initialize
            await factory.createPool(await weth9.getAddress(), await dai.getAddress(), 3000);
            const poolAddr = await factory.getPool(await weth9.getAddress(), await dai.getAddress(), 3000);
            const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
            await pool.initialize(79228162514264337593543950336n);

            // Provide liquidity (balanced amounts)
            await weth9.connect(user).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await dai.connect(user).approve(await positionManager.getAddress(), ethers.MaxUint256);
            await positionManager.connect(user).mint({
                token0: await weth9.getAddress(),
                token1: await dai.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user.address,
                deadline: Math.floor(Date.now() / 1000) + 1800
            });

            // Approve tokens
            await weth9.connect(user).approve(await router.getAddress(), ethers.MaxUint256);
            await dai.connect(user).approve(await router.getAddress(), ethers.MaxUint256);

            // Perform swap WETH -> DAI
            const amountIn = ethers.parseEther("0.001");
            const balanceBefore = await dai.balanceOf(user.address);

            await router.connect(user).exactInputSingle({
                tokenIn: await weth9.getAddress(),
                tokenOut: await dai.getAddress(),
                fee: 3000,
                recipient: user.address,
                deadline: Math.floor(Date.now() / 1000) + 1800,
                amountIn: amountIn,
                amountOutMinimum: 1n,
                sqrtPriceLimitX96: 0
            });

            const balanceAfter = await dai.balanceOf(user.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });
    });

    describe("System Integration", function () {
        it("should maintain correct state across all contracts", async function () {
            const { factory, oracleRegistry, positionManager, router, weth9, usdc, usdt } = await loadFixture(deployFixture);

            // Check factory state
            expect(await factory.timelock()).to.not.equal(ethers.ZeroAddress);
            expect(await factory.oracleRegistry()).to.equal(await oracleRegistry.getAddress());

            // Check oracle registry state
            expect(await oracleRegistry.hasFeed(await weth9.getAddress())).to.be.true;
            expect(await oracleRegistry.hasFeed(await usdc.getAddress())).to.be.true;
            expect(await oracleRegistry.hasFeed(await usdt.getAddress())).to.be.true;

            // Check position manager state
            expect(await positionManager.factory()).to.equal(await factory.getAddress());
            expect(await positionManager.WETH9()).to.equal(await weth9.getAddress());

            // Check router state
            expect(await router.factory()).to.equal(await factory.getAddress());
            expect(await router.WETH9()).to.equal(await weth9.getAddress());
        });

        it("should allow users to interact with the complete system", async function () {
            const { user, factory, weth9, usdc, router, positionManager } = await loadFixture(deployFixture);

            // User should be able to approve tokens
            await weth9.approve(await router.getAddress(), ethers.MaxUint256);
            await usdc.approve(await router.getAddress(), ethers.MaxUint256);
            await weth9.approve(await positionManager.getAddress(), ethers.MaxUint256);
            await usdc.approve(await positionManager.getAddress(), ethers.MaxUint256);

            // Create a pool and verify retrieval
            await factory.createPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            const poolAddress = await factory.getPool(await weth9.getAddress(), await usdc.getAddress(), 3000);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);
        });
    });
}); 