import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("RubySwapFactory", function () {
	it("should set default fee tiers on deploy", async function () {
		const [deployer] = await ethers.getSigners();
		
		// Deploy Timelock first
		const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
		const timelock = await RubySwapTimelock.deploy(
			[deployer.address], // proposers
			[deployer.address], // executors
			deployer.address    // admin
		);
		await timelock.waitForDeployment();

		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.deploy(await timelock.getAddress());
		await factory.waitForDeployment();

		expect(await factory.feeAmountTickSpacing(500)).to.equal(10);
		expect(await factory.feeAmountTickSpacing(3000)).to.equal(60);
		expect(await factory.feeAmountTickSpacing(10000)).to.equal(200);
	});

	it("should allow owner to enable a new fee tier and reject duplicates", async function () {
		const [owner, other] = await ethers.getSigners();
		
		// Deploy Timelock first
		const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
		const timelock = await RubySwapTimelock.deploy(
			[owner.address], // proposers
			[owner.address], // executors
			owner.address    // admin
		);
		await timelock.waitForDeployment();

		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.connect(owner).deploy(await timelock.getAddress());
		await factory.waitForDeployment();

		// Grant PROPOSER_ROLE to owner so they can propose operations
		const PROPOSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROPOSER_ROLE"));
		await timelock.grantRole(PROPOSER_ROLE, owner.address);

		// For testing purposes, we'll temporarily change the timelock to the owner
		// so we can call enableFeeAmount directly
		await factory.setTimelock(owner.address);
		
		await expect(factory.enableFeeAmount(1234, 55)).to.not.be.reverted;
		expect(await factory.feeAmountTickSpacing(1234)).to.equal(55);

		await expect(factory.enableFeeAmount(1234, 55)).to.be.revertedWith("FEE_ENABLED");
		// Other user doesn't have timelock access, so they get NOT_TIMELOCK error
		await expect(factory.connect(other).enableFeeAmount(2222, 33)).to.be.revertedWith("NOT_TIMELOCK");
	});

	it("should revert createPool until both tokens have feeds", async function () {
		const [deployer] = await ethers.getSigners();
		
		const Token = await ethers.getContractFactory("MockERC20");
		const tokenA = await Token.deploy("TokenA", "TKA", 18);
		const tokenB = await Token.deploy("TokenB", "TKB", 18);
		await tokenA.waitForDeployment();
		await tokenB.waitForDeployment();

		// Deploy Timelock first
		const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
		const timelock = await RubySwapTimelock.deploy(
			[deployer.address], // proposers
			[deployer.address], // executors
			deployer.address    // admin
		);
		await timelock.waitForDeployment();

		const Factory = await ethers.getContractFactory("RubySwapFactory");
		const factory = await Factory.deploy(await timelock.getAddress());
		await factory.waitForDeployment();

		await expect(factory.createPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000)).to.be.revertedWith(
			"MISSING_ORACLE_FEEDS"
		);

		const registryAddr = await factory.oracleRegistry();
		const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
		const registry = OracleRegistry.attach(registryAddr);
		await registry.setFeed(await tokenA.getAddress(), ethers.Wallet.createRandom().address);
		await expect(factory.createPool(await tokenA.getAddress(), await tokenB.getAddress(), 3000)).to.be.revertedWith(
			"MISSING_ORACLE_FEEDS"
		);
		await registry.setFeed(await tokenB.getAddress(), ethers.Wallet.createRandom().address);

		const fee = 3000;
		const ts = await factory.feeAmountTickSpacing(fee);
		const addrA = await tokenA.getAddress();
		const addrB = await tokenB.getAddress();
		const [token0, token1] = addrA < addrB ? [addrA, addrB] : [addrB, addrA];

		await expect(factory.createPool(addrA, addrB, fee))
			.to.emit(factory, "PoolCreated");
		const poolAddr = await factory.getPool(addrA, addrB, fee);
		expect(poolAddr).to.properAddress;
	});
}); 