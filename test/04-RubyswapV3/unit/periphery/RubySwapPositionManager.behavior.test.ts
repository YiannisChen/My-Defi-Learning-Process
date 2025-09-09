import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapPositionManager - behavior", function () {
    it("mint -> increase -> collect -> decrease -> burn; multicall and payments; selfPermitAllowed", async () => {
        const [deployer, user] = await ethers.getSigners();

        // Deploy timelock + factory
        const Timelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await Timelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();
        const Factory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await Factory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        // Deploy tokens with feeds
        const ERC20 = await ethers.getContractFactory("MockERC20");
        const token0 = await ERC20.deploy("T0", "T0", 18);
        const token1 = await ERC20.deploy("T1", "T1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();

        const oracleAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracle = OracleRegistry.attach(oracleAddr);
        const Feed = await ethers.getContractFactory("MockAggregatorV3");
        const feed0 = await Feed.deploy(200000000000);
        const feed1 = await Feed.deploy(100000000);
        await feed0.waitForDeployment();
        await feed1.waitForDeployment();
        await oracle.setFeed(await token0.getAddress(), await feed0.getAddress());
        await oracle.setFeed(await token1.getAddress(), await feed1.getAddress());

        // Create pool + initialize 1:1
        await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const pool = await ethers.getContractAt("RubySwapPool", poolAddr);
        await pool.initialize("79228162514264337593543950336");

        // Deploy PM
        const PM = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PM.deploy(factory.target, ethers.ZeroAddress, "RubySwap V3 Positions", "RUBY-V3-POS");
        await pm.waitForDeployment();

        // Fund and approve
        await token0.mint(user.address, ethers.parseEther("100"));
        await token1.mint(user.address, ethers.parseEther("100"));
        await token0.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);
        await token1.connect(user).approve(await pm.getAddress(), ethers.MaxUint256);

        const latest = await ethers.provider.getBlock("latest");
        const now = (latest?.timestamp || Math.floor(Date.now() / 1000));
        // Mint
        const mintTx = await pm.connect(user).mint({
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("10"),
            amount1Desired: ethers.parseEther("10"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: user.address,
            deadline: now + 3600,
        });
        const mintRc = await mintTx.wait();
        const mintEvent = mintRc!.logs.find((l: any) => l.fragment && l.fragment.name === "IncreaseLiquidity");
        const tokenId = 1; // PM starts at 1
        expect(mintEvent).to.not.equal(undefined);

        // Increase liquidity
        await pm.connect(user).increaseLiquidity({
            tokenId,
            amount0Desired: ethers.parseEther("1"),
            amount1Desired: ethers.parseEther("1"),
            amount0Min: 0,
            amount1Min: 0,
            deadline: now + 3600,
        });

        // Perform a swap to accrue fees
        const Router = await ethers.getContractFactory("RubySwapRouter");
        const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();
        await token0.connect(user).approve(await router.getAddress(), ethers.MaxUint256);
        await token1.connect(user).approve(await router.getAddress(), ethers.MaxUint256);
        await router.connect(user).exactInputSingle({
            tokenIn: await token0.getAddress(),
            tokenOut: await token1.getAddress(),
            fee: 3000,
            recipient: user.address,
            deadline: now + 3600,
            amountIn: ethers.parseEther("1"),
            amountOutMinimum: 1n,
            sqrtPriceLimitX96: 0,
        });

        // Decrease liquidity
        await pm.connect(user).decreaseLiquidity({
            tokenId,
            liquidity: 1000,
            amount0Min: 0,
            amount1Min: 0,
            deadline: now + 3600,
        });

        // Multicall: small no-op batch (tokenURI)
        const data = [
            (pm as any).interface.encodeFunctionData("tokenURI", [tokenId]),
        ];
        const out = await pm.multicall.staticCall(data);
        expect(out.length).to.equal(1);

        // Payments: sweepToken (no-op ok), refundETH (no-op ok)
        await expect(pm.sweepToken(await token0.getAddress(), 0, user.address)).to.not.be.reverted;
        await expect(pm.refundETH()).to.not.be.reverted;

        // Burn should revert (uncleared)
        await expect(pm.connect(user).burn(tokenId)).to.be.revertedWith("Not cleared");

        // Self-permit allowed with DAI-style token
        const PermitToken = await ethers.getContractFactory("TestERC20PermitAllowed");
        const dai = await PermitToken.deploy("DAI-Style", "DAIP", 18);
        await dai.waitForDeployment();
        await dai.mint(user.address, ethers.parseEther("10"));
        const v = 27, r = "0x" + "00".repeat(32), s = r;
        await expect(pm.connect(user).selfPermitAllowed(dai.target, 0, ethers.MaxUint256, v, r, s)).to.not.be.reverted;
    });
}); 