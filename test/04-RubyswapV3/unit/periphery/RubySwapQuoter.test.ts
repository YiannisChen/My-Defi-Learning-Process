import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapQuoter", function () {
	let factory: any;
	let quoter: any;
	let token0: any;
	let token1: any;
	let pool: any;
	let user1: any;
	let timelock: any;

	beforeEach(async function () {
		[user1] = await ethers.getSigners();

		// Timelock
		const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
		timelock = await RubySwapTimelock.deploy([user1.address], [user1.address], user1.address);
		await timelock.waitForDeployment();

		// Factory
		const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
		factory = await RubySwapFactory.deploy(await timelock.getAddress());
		await factory.waitForDeployment();

		// Tokens
		const MockERC20 = await ethers.getContractFactory("MockERC20");
		token0 = await MockERC20.deploy("Token0", "TK0", 18);
		token1 = await MockERC20.deploy("Token1", "TK1", 18);
		await token0.waitForDeployment();
		await token1.waitForDeployment();
		if ((await token0.getAddress()) > (await token1.getAddress())) {
			[token0, token1] = [token1, token0];
		}

		// Oracle feeds on factory's registry
		const oracleRegistryAddr = await factory.oracleRegistry();
		const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
		const oracleRegistry = OracleRegistry.attach(oracleRegistryAddr);
		const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
		const token0Feed = await MockAggregatorV3.deploy(200000000000);
		const token1Feed = await MockAggregatorV3.deploy(100000000);
		await token0Feed.waitForDeployment();
		await token1Feed.waitForDeployment();
		await oracleRegistry.setFeed(token0.target, token0Feed.target);
		await oracleRegistry.setFeed(token1.target, token1Feed.target);

		// Pool
		await factory.createPool(token0.target, token1.target, 3000);
		const poolAddress = await factory.getPool(token0.target, token1.target, 3000);
		pool = await ethers.getContractAt("RubySwapPool", poolAddress);
		await pool.initialize("79228162514264337593543950336"); // 1:1

		// Provide liquidity via position manager
		const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
		const positionManager = await RubySwapPositionManager.deploy(
			factory.target,
			ethers.ZeroAddress,
			"RubySwap V3 Positions",
			"RUBY-V3-POS"
		);
		await positionManager.waitForDeployment();

		await token0.mint(user1.address, ethers.parseEther("100"));
		await token1.mint(user1.address, ethers.parseEther("100"));
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
			recipient: await user1.getAddress(),
			deadline: now + 3600
		};
		await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
		await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
		await positionManager.connect(user1).mint(mintParams);

		// Quoter
		const RubySwapQuoter = await ethers.getContractFactory("RubySwapQuoter");
		quoter = await RubySwapQuoter.deploy(await factory.getAddress());
		await quoter.waitForDeployment();
	});

	it("quoteExactInputSingle returns >0 for token0->token1", async function () {
		const out = await quoter.quoteExactInputSingle.staticCall(
			await token0.getAddress(),
			await token1.getAddress(),
			3000,
			ethers.parseEther("1"),
			0
		);
		expect(out).to.be.gt(0n);
	});

	it("quoteExactOutputSingle returns >0 for token0->token1", async function () {
		const inAmt = await quoter.quoteExactOutputSingle.staticCall(
			await token0.getAddress(),
			await token1.getAddress(),
			3000,
			ethers.parseEther("1"),
			0
		);
		expect(inAmt).to.be.gt(0n);
	});

	it("quoteExactInput over a single-hop path returns >0", async function () {
		const path = ethers.solidityPacked(
			["address","uint24","address"],
			[await token0.getAddress(), 3000, await token1.getAddress()]
		);
		const out = await quoter.quoteExactInput.staticCall(path, ethers.parseEther("1"));
		expect(out).to.be.gt(0n);
	});

	it("quoteExactOutput over a single-hop path returns >0", async function () {
		const path = ethers.solidityPacked(
			["address","uint24","address"],
			[await token0.getAddress(), 3000, await token1.getAddress()]
		);
		const inAmt = await quoter.quoteExactOutput.staticCall(path, ethers.parseEther("1"));
		expect(inAmt).to.be.gt(0n);
	});
}); 