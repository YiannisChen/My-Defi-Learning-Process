import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RubySwapRouter Exact Output Swaps", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let router: any;
    let positionManager: any;
    let token0: any;
    let token1: any;
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

        await oracleRegistry.setFeed(token0.target, token0Feed.target);
        await oracleRegistry.setFeed(token1.target, token1Feed.target);

        // Create pool using factory
        await factory.createPool(token0.target, token1.target, 3000);
        const poolAddress = await factory.getPool(token0.target, token1.target, 3000);
        pool = await ethers.getContractAt("RubySwapPool", poolAddress);

        // Initialize pool
        await pool.initialize("79228162514264337593543950336"); // 1:1 price

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
        router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        // Mint tokens to deployer for liquidity provision
        await token0.mint(deployer.address, ethers.parseEther("100"));
        await token1.mint(deployer.address, ethers.parseEther("10000"));

        // Mint tokens to user
        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));

        // Add initial liquidity
        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
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
            deadline: now + 3600
        };
        
        await token0.approve(await positionManager.getAddress(), mintParams.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams.amount1Desired);
        await positionManager.mint(mintParams);
    });

    describe("Exact Output Single Swap", function () {
        it("should perform exact output single swap", async function () {
            const amountOut = ethers.parseEther("1");
            const amountInMaximum = ethers.parseEther("2"); // Allow up to 2 tokens for slippage
            
            // Approve router to spend user's tokens
            await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
            
            const swapParams = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: await user1.getAddress(),
                deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            };
            
            const balanceBefore = await token1.balanceOf(user1.address);
            await router.connect(user1).exactOutputSingle(swapParams);
            const balanceAfter = await token1.balanceOf(user1.address);
            
            expect(balanceAfter - balanceBefore).to.equal(amountOut);
        });

        it("should revert when amountIn exceeds maximum", async function () {
            const amountOut = ethers.parseEther("1");
            const amountInMaximum = ethers.parseEther("0.5"); // Too low, should revert
            
            await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
            
            const swapParams = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: await user1.getAddress(),
                deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            };
            
            await expect(router.connect(user1).exactOutputSingle(swapParams))
                .to.be.revertedWith("Too much requested");
        });
    });

    describe("Exact Output Multi-hop Swap", function () {
        it("should perform exact output multi-hop swap", async function () {
            // This test would require multiple pools, but for now we'll test the basic functionality
            // by ensuring the function doesn't revert on basic calls
            
            const amountOut = ethers.parseEther("1");
            const amountInMaximum = ethers.parseEther("2");
            
            // Create a simple path (single hop for now)
            const path = ethers.solidityPacked(
                ["address", "uint24", "address"],
                [await token0.getAddress(), 3000, await token1.getAddress()]
            );
            
            await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
            
            const swapParams = {
                path: path,
                recipient: await user1.getAddress(),
                deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum
            };
            
            // This should work for single-hop paths
            await expect(router.connect(user1).exactOutput(swapParams)).to.not.be.reverted;
        });
    });

    it.skip('exactOutputSingle: zero price limit uses MIN/MAX based on direction', async () => {
      const { ethers } = await import('hardhat');
      const [owner, user] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const t0 = await MockERC20.deploy('T0','T0',18); await t0.waitForDeployment();
      const t1 = await MockERC20.deploy('T1','T1',18); await t1.waitForDeployment();
      const Timelock = await ethers.getContractFactory('RubySwapTimelock');
      const tl = await Timelock.deploy([owner.address],[owner.address],owner.address); await tl.waitForDeployment();
      const Factory = await ethers.getContractFactory('RubySwapFactory');
      const factory = await Factory.deploy(await tl.getAddress()); await factory.waitForDeployment();
      const MockAgg = await ethers.getContractFactory('MockAggregatorV3');
      const feed0 = await MockAgg.deploy(1n); const feed1 = await MockAgg.deploy(1n);
      await feed0.waitForDeployment(); await feed1.waitForDeployment();
      const reg = await ethers.getContractAt(["function setFeed(address,address) external"], await factory.oracleRegistry());
      await reg.setFeed(await t0.getAddress(), await feed0.getAddress());
      await reg.setFeed(await t1.getAddress(), await feed1.getAddress());
      await factory.createPool(await t0.getAddress(), await t1.getAddress(), 3000);
      const poolAddr = await factory.getPool(await t0.getAddress(), await t1.getAddress(), 3000);
      const pool = await ethers.getContractAt('RubySwapPool', poolAddr);
      await pool.initialize('79228162514264337593543950336');
      const Router = await ethers.getContractFactory('RubySwapRouter');
      const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress); await router.waitForDeployment();
      await t0.mint(user.address, ethers.parseEther('10'));
      await t1.mint(owner.address, ethers.parseEther('10'));
      // Add small liquidity so swap succeeds
      const PM = await ethers.getContractFactory('RubySwapPositionManager');
      const pm = await PM.deploy(await factory.getAddress(), ethers.ZeroAddress, 'x','y'); await pm.waitForDeployment();
      await t0.connect(owner).approve(await pm.getAddress(), ethers.parseEther('1'));
      await t1.connect(owner).approve(await pm.getAddress(), ethers.parseEther('1'));
      await pm.connect(owner).mint({token0: await t0.getAddress(), token1: await t1.getAddress(), fee:3000, tickLower:-60, tickUpper:60, amount0Desired: ethers.parseEther('1'), amount1Desired: ethers.parseEther('1'), amount0Min:0, amount1Min:0, recipient: owner.address, deadline: Math.floor(Date.now()/1000)+3600});
      await t0.connect(user).approve(await router.getAddress(), ethers.MaxUint256);
      const latest = await ethers.provider.getBlock('latest');
      const now = Number(latest?.timestamp ?? 0);
      await router.connect(user).exactOutputSingle({ tokenIn: await t0.getAddress(), tokenOut: await t1.getAddress(), fee:3000, recipient:user.address, deadline: now+3600, amountOut: 1n, amountInMaximum: ethers.parseEther('1'), sqrtPriceLimitX96: 0 });
    });

    it.skip('exactOutput: rejects far deadline and bad path', async () => {
      const { ethers } = await import('hardhat');
      const [owner, user] = await ethers.getSigners();
      const Timelock = await ethers.getContractFactory('RubySwapTimelock');
      const tl = await Timelock.deploy([owner.address],[owner.address],owner.address); await tl.waitForDeployment();
      const Factory = await ethers.getContractFactory('RubySwapFactory');
      const factory = await Factory.deploy(await tl.getAddress()); await factory.waitForDeployment();
      const Router = await ethers.getContractFactory('RubySwapRouter');
      const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress); await router.waitForDeployment();
      const latest = await ethers.provider.getBlock('latest');
      const now = Number(latest?.timestamp ?? 0);
      const badPath = '0x';
      await expect(router.connect(user).exactOutput({ path: badPath, recipient: user.address, deadline: now+3600, amountOut: 1n, amountInMaximum: 1n })).to.be.reverted;
      await expect(router.connect(user).exactOutput({ path: badPath, recipient: user.address, deadline: now+86400, amountOut: 1n, amountInMaximum: 1n })).to.be.reverted;
    });
}); 