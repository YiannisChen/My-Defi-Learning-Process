import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Working Swap Test", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    
    let factory: any;
    let positionManager: any;
    let router: any;
    let token0: any;
    let token1: any;
    let token2: any;
    let pool: any;
    let pool2: any;

    before(async function () {
        [deployer, user1] = await ethers.getSigners();

        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy(
            [deployer.address],
            [deployer.address],
            deployer.address
        );
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const oracleRegistryAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "TK0", 18);
        token1 = await MockERC20.deploy("Token1", "TK1", 18);
        token2 = await MockERC20.deploy("Token2", "TK2", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();
        await token2.waitForDeployment();

        if ((await token0.getAddress()) > (await token1.getAddress())) {
            [token0, token1] = [token1, token0];
        }

        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            factory.target,
            ethers.ZeroAddress,
            "RubySwap V3 Positions",
            "RUBY-V3-POS"
        );
        await positionManager.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(factory.target, ethers.ZeroAddress);
        await router.waitForDeployment();

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const token0Feed = await MockAggregatorV3.deploy(200000000000);
        const token1Feed = await MockAggregatorV3.deploy(100000000);
        const token2Feed = await MockAggregatorV3.deploy(500000000);
        await token0Feed.waitForDeployment();
        await token1Feed.waitForDeployment();
        await token2Feed.waitForDeployment();

        await oracleRegistry.setFeed(token0.target, token0Feed.target);
        await oracleRegistry.setFeed(token1.target, token1Feed.target);
        await oracleRegistry.setFeed(token2.target, token2Feed.target);

        await factory.createPool(token0.target, token1.target, 3000);
        const poolAddress = await factory.getPool(token0.target, token1.target, 3000);
        pool = await ethers.getContractAt("RubySwapPool", poolAddress);

        await factory.createPool(token1.target, token2.target, 3000);
        const pool2Address = await factory.getPool(token1.target, token2.target, 3000);
        pool2 = await ethers.getContractAt("RubySwapPool", pool2Address);

        await pool.initialize("79228162514264337593543950336");
        await pool2.initialize("79228162514264337593543950336");

        await token0.mint(deployer.address, ethers.parseEther("10"));
        await token1.mint(deployer.address, ethers.parseEther("10"));
        await token2.mint(deployer.address, ethers.parseEther("10"));

        await token0.mint(user1.address, ethers.parseEther("10"));
        await token1.mint(user1.address, ethers.parseEther("10000"));
        await token2.mint(user1.address, ethers.parseEther("10000"));
    });

    it("should provide liquidity and perform swaps successfully", async function () {
        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        const mintParams1 = {
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("1"),
            amount1Desired: ethers.parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: await deployer.getAddress(),
            deadline: now + 300
        };
        
        await token0.approve(await positionManager.getAddress(), mintParams1.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams1.amount1Desired);
        await positionManager.mint(mintParams1);
        
        const mintParams2 = {
            token0: await token1.getAddress(),
            token1: await token2.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("1"),
            amount1Desired: ethers.parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: await deployer.getAddress(),
            deadline: now + 300
        };
        
        await token1.approve(await positionManager.getAddress(), mintParams2.amount0Desired);
        await token2.approve(await positionManager.getAddress(), mintParams2.amount1Desired);
        await positionManager.mint(mintParams2);
        
        const liquidity1 = await pool.liquidity();
        const liquidity2 = await pool2.liquidity();
        expect(liquidity1).to.be.gt(0);
        expect(liquidity2).to.be.gt(0);
        
        const poolSqrtPrice = await pool.sqrtPriceX96();
        const poolTick = await pool.tick();
        expect(poolSqrtPrice).to.be.gt(0);
        expect(poolTick).to.equal(0);
        
        const swapParams = {
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: await user1.getAddress(),
            deadline: now + 300,
            amountIn: ethers.parseEther("0.1"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0
        };
        
        await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
        const balanceBefore = await token1.balanceOf(await user1.getAddress());

        await router.connect(user1).exactInputSingle(swapParams);
        const balanceAfter = await token1.balanceOf(await user1.getAddress());
        expect(balanceAfter).to.be.gt(balanceBefore);
        
        const path = ethers.solidityPacked(
            ["address", "uint24", "address", "uint24", "address"],
            [await token0.getAddress(), 3000, await token1.getAddress(), 3000, await token2.getAddress()]
        );
        
        const multiHopParams = {
            path: path,
            recipient: await user1.getAddress(),
            deadline: now + 300,
            amountIn: ethers.parseEther("0.01"),
            amountOutMinimum: 1n
        };
        
        await token0.connect(user1).approve(await router.getAddress(), multiHopParams.amountIn);
        const token2BalanceBefore = await token2.balanceOf(await user1.getAddress());
        await router.connect(user1).exactInput(multiHopParams);
        const token2BalanceAfter = await token2.balanceOf(await user1.getAddress());
        expect(token2BalanceAfter).to.be.gt(token2BalanceBefore);
    });
}); 