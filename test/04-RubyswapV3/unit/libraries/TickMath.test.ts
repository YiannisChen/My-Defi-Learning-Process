import { ethers } from "hardhat";
import { expect } from "chai";

describe("TickMath", () => {
	it("getSqrtRatioAtTick(0) == Q96 and inverse tick == 0", async () => {
		const TickMathFactory = await ethers.getContractFactory("TestTickMath");
		const lib = await TickMathFactory.deploy();
		await lib.waitForDeployment();

		const q96 = 1n << 96n;
		const sqrtAt0 = await lib.getSqrtRatioAtTickWrapper(0);
		expect(sqrtAt0).to.equal(q96);

		const tickBack = await lib.getTickAtSqrtRatioWrapper(sqrtAt0);
		expect(tickBack).to.equal(0);
	});

	it("bounds: MIN_TICK and MAX_TICK - 1 are valid", async () => {
		const TickMathFactory = await ethers.getContractFactory("TestTickMath");
		const lib = await TickMathFactory.deploy();
		await lib.waitForDeployment();

		// Known valid bound checks (no revert)
		await lib.getSqrtRatioAtTickWrapper(-887271);
		await lib.getSqrtRatioAtTickWrapper(887271);
	});
}); 