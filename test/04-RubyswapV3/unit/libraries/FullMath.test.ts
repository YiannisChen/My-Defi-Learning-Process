import { ethers } from "hardhat";
import { expect } from "chai";

describe("FullMath", () => {
	it("mulDiv basic", async () => {
		const Factory = await ethers.getContractFactory("TestFullMath");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const v = await lib.mulDivWrapper(6, 7, 3);
		expect(v).to.equal(14n);
	});

	it("mulDivRoundingUp when remainder > 0", async () => {
		const Factory = await ethers.getContractFactory("TestFullMath");
		const lib = await Factory.deploy();
		await lib.waitForDeployment();
		const v = await lib.mulDivRoundingUpWrapper(5, 5, 2);
		expect(v).to.equal(13n);
	});
}); 