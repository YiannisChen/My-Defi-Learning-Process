import { expect } from "chai";
import { ethers } from "hardhat";

describe("TickBitmap library (smoke)", function () {
	it("computes next initialized tick within one word for lte and gt", async function () {
		const Harness = await ethers.getContractFactory("TestTickBitmap");
		const harness = await Harness.deploy();
		const spacing = 60;

		// Initialize some ticks
		await harness.flip(0, spacing);
		await harness.flip(60, spacing);
		await harness.flip(120, spacing);

		// Search to the left (lte)
		const resLeft = await harness.next(100, spacing, true);
		expect(resLeft[1]).to.equal(true); // initialized
		expect(Number(resLeft[0])).to.equal(60);

		// Search to the right (!lte)
		const resRight = await harness.next(60, spacing, false);
		expect(resRight[1]).to.equal(true);
		expect(Number(resRight[0])).to.equal(120);
	});
}); 