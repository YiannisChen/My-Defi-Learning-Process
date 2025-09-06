import { ethers } from "hardhat";
import { expect } from "chai";

describe("SafeCast", () => {
	it("toUint160 within range", async () => {
		const Factory = await ethers.getContractFactory("TestSafeCast");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const maxUint160 = (1n << 160n) - 1n;
		const v = await lib.toUint160Wrapper(maxUint160);
		expect(v).to.equal(maxUint160);
	});

	it("toUint160 overflow reverts", async () => {
		const Factory = await ethers.getContractFactory("TestSafeCast");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const overflow = 1n << 160n;
		await expect(lib.toUint160Wrapper(overflow)).to.be.reverted;
	});

	it("toInt128 within range and overflow reverts", async () => {
		const Factory = await ethers.getContractFactory("TestSafeCast");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const max = (1n << 127n) - 1n;
		const min = -((1n << 127n));
		await lib.toInt128Wrapper(max);
		await lib.toInt128Wrapper(min);
		await expect(lib.toInt128Wrapper(max + 1n)).to.be.reverted;
		await expect(lib.toInt128Wrapper(min - 1n)).to.be.reverted;
	});

	it("toInt256 within range and overflow reverts", async () => {
		const Factory = await ethers.getContractFactory("TestSafeCast");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const ok = (1n << 255n) - 1n;
		await lib.toInt256Wrapper(ok);
		await expect(lib.toInt256Wrapper(1n << 255n)).to.be.reverted;
	});
}); 