import { expect } from "chai";
import { ethers } from "hardhat";

describe("LimitOrderManager.preview branches", function () {
	it("no quoter returns amountOut=0; TWAP disabled => deviationBps=0", async function () {
		const [deployer, user] = await ethers.getSigners();
		const Timelock = await ethers.getContractFactory("RubySwapTimelock");
		const tl = await Timelock.deploy([deployer.address], [deployer.address], deployer.address); await tl.waitForDeployment();
		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.deploy(await tl.getAddress()); await factory.waitForDeployment();
		const Router = await ethers.getContractFactory("RubySwapRouter");
		const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress); await router.waitForDeployment();
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const usdc = await MockERC20.deploy("USD Coin", "USDC", 6); await usdc.waitForDeployment();
		// Oracle registry wiring
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const feed = await MockAgg.deploy(1_000_000_00n); await feed.waitForDeployment();
		const reg = await ethers.getContractAt("OracleRegistry", await factory.oracleRegistry());
		await reg.setFeed(await usdc.getAddress(), await feed.getAddress());

		const LOM = await ethers.getContractFactory("LimitOrderManager");
		const lom = await LOM.deploy(await router.getAddress(), await reg.getAddress(), await usdc.getAddress(), 1_000_000n, 180_000n); await lom.waitForDeployment();
		await lom.setPermissionedKeepers(false);
		await lom.setKeeperConfig(await usdc.getAddress(), 1_000_000n, 180_000, 2000);

		// place order minimal
		await usdc.mint(await user.getAddress(), 100000000n);
		await usdc.connect(user).approve(await lom.getAddress(), 1_000_000n);
		const now = (await ethers.provider.getBlock("latest")).timestamp;
		const tx = await lom.connect(user).placeOrder({
			tokenIn: await usdc.getAddress(), tokenOut: await usdc.getAddress(), fee: 3000, sqrtPriceLimitX96: 0, amountIn: 1n, minAmountOut: 1, expiry: BigInt(now + 600), prepaidFee: 1_000_000n
		});
		const rc = await tx.wait();
		const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];
		const res = await lom.preview.staticCall(orderId);
		const amountOut = res[0];
		const deviationBps = res[1];
		expect(amountOut).to.equal(0n);
		expect(deviationBps).to.equal(0n);
	});

	it("with quoter returns amountOut; TWAP enabled with pool returns deviationBps", async function () {
		const [deployer, user] = await ethers.getSigners();
		const Timelock = await ethers.getContractFactory("RubySwapTimelock");
		const tl = await Timelock.deploy([deployer.address], [deployer.address], deployer.address); await tl.waitForDeployment();
		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.deploy(await tl.getAddress()); await factory.waitForDeployment();
		const Router = await ethers.getContractFactory("RubySwapRouter");
		const router = await Router.deploy(await factory.getAddress(), ethers.ZeroAddress); await router.waitForDeployment();
		const Quoter = await ethers.getContractFactory("RubySwapQuoter");
		const quoter = await Quoter.deploy(await factory.getAddress()); await quoter.waitForDeployment();
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		const t0 = await MockERC20.deploy("T0","T0",18); await t0.waitForDeployment();
		const t1 = await MockERC20.deploy("T1","T1",18); await t1.waitForDeployment();
		// Oracle registry
		const MockAgg = await ethers.getContractFactory("MockAggregatorV3");
		const f0 = await MockAgg.deploy(2_000_000_00n); const f1 = await MockAgg.deploy(1_000_000_00n);
		await f0.waitForDeployment(); await f1.waitForDeployment();
		const reg = await ethers.getContractAt("OracleRegistry", await factory.oracleRegistry());
		await reg.setFeed(await t0.getAddress(), await f0.getAddress());
		await reg.setFeed(await t1.getAddress(), await f1.getAddress());
		// Create pool and initialize
		await factory.createPool(await t0.getAddress(), await t1.getAddress(), 3000);
		const poolAddr = await factory.getPool(await t0.getAddress(), await t1.getAddress(), 3000);
		const Pool = await ethers.getContractFactory("RubySwapPool");
		const pool = Pool.attach(poolAddr);
		await pool.initialize("79228162514264337593543950336");
		// Provide small liquidity via PositionManager
		const PM = await ethers.getContractFactory("RubySwapPositionManager");
		const pm = await PM.deploy(await factory.getAddress(), ethers.ZeroAddress, "pos","pos"); await pm.waitForDeployment();
		await t0.mint(await deployer.getAddress(), ethers.parseEther("10"));
		await t1.mint(await deployer.getAddress(), ethers.parseEther("10"));
		await t0.approve(await pm.getAddress(), ethers.parseEther("10"));
		await t1.approve(await pm.getAddress(), ethers.parseEther("10"));
		const latest = await ethers.provider.getBlock("latest"); const dl = (latest?.timestamp || 0) + 3600;
		await pm.mint({ token0: await t0.getAddress(), token1: await t1.getAddress(), fee:3000, tickLower:-60, tickUpper:60, amount0Desired: ethers.parseEther("1"), amount1Desired: ethers.parseEther("1"), amount0Min:0, amount1Min:0, recipient: await deployer.getAddress(), deadline: dl });

		const LOM = await ethers.getContractFactory("LimitOrderManager");
		const lom = await LOM.deploy(await router.getAddress(), await reg.getAddress(), await t1.getAddress(), 1_000_000n, 180_000n); await lom.waitForDeployment();
		await lom.setFactory(await factory.getAddress());
		await lom.setQuoter(await quoter.getAddress());
		await lom.setOracleConfig(await reg.getAddress(), true, 1, 300);

		// place order
		await t0.mint(await user.getAddress(), ethers.parseEther("1"));
		await t0.connect(user).approve(await lom.getAddress(), ethers.parseEther("1"));
		// approve prepaid fee in feeToken (t1)
		await t1.mint(await user.getAddress(), ethers.parseEther("10"));
		await t1.connect(user).approve(await lom.getAddress(), 1_000_000n);
		const now = (await ethers.provider.getBlock("latest")).timestamp;
		const rc = await (await lom.connect(user).placeOrder({ tokenIn: await t0.getAddress(), tokenOut: await t1.getAddress(), fee:3000, sqrtPriceLimitX96:0, amountIn: ethers.parseEther("1"), minAmountOut: 1, expiry: BigInt(now+600), prepaidFee: 1_000_000n })).wait();
		const orderId = rc!.logs.find((l: any) => l.fragment?.name === "OrderPlaced").args[0];

		// Prepare TWAP observations: increase cardinality, perform swap, advance time
		await pool.increaseObservationCardinalityNext(16);
		await t0.mint(await deployer.getAddress(), ethers.parseEther("0.1"));
		await t0.approve(await router.getAddress(), ethers.parseEther("0.1"));
		await router.exactInputSingle({ tokenIn: await t0.getAddress(), tokenOut: await t1.getAddress(), fee:3000, recipient: await deployer.getAddress(), deadline: (await ethers.provider.getBlock("latest")).timestamp + 3600, amountIn: ethers.parseEther("0.01"), amountOutMinimum: 1n, sqrtPriceLimitX96: 0 });
		await ethers.provider.send("evm_increaseTime", [2]);
		await ethers.provider.send("evm_mine", []);

		const res = await lom.preview.staticCall(orderId);
		const amountOut = res[0];
		const deviationBps = res[1];
		expect(amountOut).to.be.gt(0n);
		expect(deviationBps).to.be.gte(0n);
	});
}); 