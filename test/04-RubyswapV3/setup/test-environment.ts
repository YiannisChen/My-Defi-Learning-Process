import { ethers } from "hardhat";
import { SignerWithAddress } from "@ethersproject/contracts";

export interface TestEnvironment {
    deployer: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
    token0: any;
    token1: any;
    token2: any;
    factory: any;
    pool: any;
    positionManager: any;
    router: any;
    quoter: any;
    oracleRegistry: any;
    timelock: any;
    performSwaps: (count: number) => Promise<void>;
}

// Helper function to deploy timelock
export async function deployTimelock(owner: SignerWithAddress) {
    const RubySwapTimelockFactory = await ethers.getContractFactory("RubySwapTimelock");
    const timelock = await RubySwapTimelockFactory.deploy(
        [owner.address], // proposers
        [owner.address], // executors
        owner.address    // admin
    );
    await timelock.waitForDeployment();
    return timelock;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
    const [deployer, user1, user2] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token0 = await MockERC20.deploy("Token0", "TK0", 18);
    const token1 = await MockERC20.deploy("Token1", "TK1", 18);
    const token2 = await MockERC20.deploy("Token2", "TK2", 18);
    
    await token0.waitForDeployment();
    await token1.waitForDeployment();
    await token2.waitForDeployment();
    
    // Deploy timelock first
    const timelock = await deployTimelock(deployer);
    
    // Deploy factory with timelock address
    const Factory = await ethers.getContractFactory("RubySwapFactory");
    const factory = await Factory.deploy(await timelock.getAddress());
    await factory.waitForDeployment();
    
    // Get oracle registry
    const oracleRegistryAddr = await factory.oracleRegistry();
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
    
    // Set up mock oracle feeds
    await oracleRegistry.setFeed(await token0.getAddress(), ethers.Wallet.createRandom().address);
    await oracleRegistry.setFeed(await token1.getAddress(), ethers.Wallet.createRandom().address);
    await oracleRegistry.setFeed(await token2.getAddress(), ethers.Wallet.createRandom().address);
    
    // Create pools
    await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
    await factory.createPool(await token1.getAddress(), await token2.getAddress(), 3000);
    
    const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
    const Pool = await ethers.getContractFactory("RubySwapPool");
    const pool = Pool.attach(poolAddr);
    
    // Initialize pool
    await pool.initialize(2n ** 96n); // 1:1 price ratio
    
    // Deploy periphery contracts
    const WETH9Factory = await ethers.getContractFactory("MockWETH9");
    const weth9 = await WETH9Factory.deploy();
    await weth9.waitForDeployment();

    const PositionManager = await ethers.getContractFactory("RubySwapPositionManager");
    const positionManager = await PositionManager.deploy(
        await factory.getAddress(),
        await weth9.getAddress(), // WETH9 address
        "RubySwap V3 Positions",
        "RUBY-V3-POS"
    );
    await positionManager.waitForDeployment();

    const Router = await ethers.getContractFactory("RubySwapRouter");
    const router = await Router.deploy(await factory.getAddress(), await weth9.getAddress()); // WETH9
    await router.waitForDeployment();
    
    const Quoter = await ethers.getContractFactory("RubySwapQuoter");
    const quoter = await Quoter.deploy(await factory.getAddress());
    await quoter.waitForDeployment();
    
    // Mint tokens to users and deployer
    const mintAmount = ethers.parseEther("1000000");
    await token0.mint(await deployer.getAddress(), mintAmount);
    await token1.mint(await deployer.getAddress(), mintAmount);
    await token2.mint(await deployer.getAddress(), mintAmount);
    await token0.mint(await user1.getAddress(), mintAmount);
    await token1.mint(await user1.getAddress(), mintAmount);
    await token2.mint(await user1.getAddress(), mintAmount);
    await token0.mint(await user2.getAddress(), mintAmount);
    await token1.mint(await user2.getAddress(), mintAmount);
    await token2.mint(await user2.getAddress(), mintAmount);
    
    // Add initial liquidity to the pool so swaps can work
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
    
    // Add liquidity to the second pool (token1-token2) for multi-hop swaps
    const pool2Addr = await factory.getPool(await token1.getAddress(), await token2.getAddress(), 3000);
    const Pool2 = await ethers.getContractFactory("RubySwapPool");
    const pool2 = Pool2.attach(pool2Addr);
    await pool2.initialize(2n ** 96n); // 1:1 price ratio
    
    const mintParams2 = {
        token0: await token1.getAddress(),
        token1: await token2.getAddress(),
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
    
    await token1.approve(await positionManager.getAddress(), mintParams2.amount0Desired);
    await token2.approve(await positionManager.getAddress(), mintParams2.amount1Desired);
    await positionManager.mint(mintParams2);
    
    // Helper function to perform swaps for fee generation
    const performSwaps = async (count: number) => {
        for (let i = 0; i < count; i++) {
            const swapParams = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: await user1.getAddress(),
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: ethers.parseEther("1"),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };
            
            await token0.connect(user1).approve(await router.getAddress(), swapParams.amountIn);
            await router.connect(user1).exactInputSingle(swapParams);
        }
    };
    
    return {
        deployer,
        user1,
        user2,
        token0,
        token1,
        token2,
        factory,
        pool,
        positionManager,
        router,
        quoter,
        oracleRegistry,
        timelock,
        performSwaps
    };
} 