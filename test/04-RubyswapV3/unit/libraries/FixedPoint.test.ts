import { ethers } from "hardhat";
import { expect } from "chai";

describe("FixedPoint constants", () => {
	it("Q96 and Q128 values", async () => {
		const Factory = await ethers.getContractFactory("TestFixedPoint");
		const c = await Factory.deploy();
		await c.waitForDeployment();
		const q96 = await c.getQ96();
		const q128 = await c.getQ128();
		expect(q96).to.equal(1n << 96n);
		expect(q128).to.equal(1n << 128n);
	});
}); 