import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("Oracle - Edge Cases", () => {
  let oracleTester: Contract;

  beforeEach(async () => {
    const OracleTester = await ethers.getContractFactory("OracleTester");
    oracleTester = await OracleTester.deploy();
  });

  describe("getSurroundingObservations - Edge Cases", () => {
    it("should handle case where target is chronologically at or after newest observation", async () => {
      // Initialize oracle with some observations
      await oracleTester.initialize(100);
      
      // Add some observations
      await oracleTester.write(100, 100, 1000);
      await oracleTester.write(200, 200, 2000);
      
      // Test case that triggers lines 220-223
      const result = await oracleTester.observeSingle(250, 50, 2, 1000);
      expect(result.tickCumulative).to.be.gt(0);
      expect(result.secondsPerLiquidityCumulativeX128).to.be.gt(0);
    });

    it("should handle case where target equals newest observation timestamp", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add observation at specific time
      await oracleTester.write(100, 100, 1000);
      
      // Test case that triggers the early return path
      const result = await oracleTester.observeSingle(100, 0, 1, 1000);
      expect(result.tickCumulative).to.equal(0);
      expect(result.secondsPerLiquidityCumulativeX128).to.equal(0);
    });

    it.skip("should handle case where target is between two observations", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add observations at different times with realistic tick values
      await oracleTester.write(100, 10, 1000);  // Use smaller tick value
      await oracleTester.write(200, 20, 2000);  // Use smaller tick value
      
      // Test case that triggers the middle path calculation
      const result = await oracleTester.observeSingle(150, 50, 15, 1000);
      expect(result.tickCumulative).to.be.gt(10);
      expect(result.secondsPerLiquidityCumulativeX128).to.be.gt(1000);
    });

    it("should handle case where target equals oldest observation timestamp", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add observations
      await oracleTester.grow(2);
      await oracleTester.write(100, 100, 1000);
      await oracleTester.write(200, 200, 2000);
      
      // Test case that triggers the left boundary path
      const result = await oracleTester.observeSingle(200, 100, 2, 1000);
      expect(result.tickCumulative).to.equal(0);
      expect(result.secondsPerLiquidityCumulativeX128).to.equal(0);
    });

    it("should handle case where target equals right boundary observation timestamp", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add observations
      await oracleTester.grow(2);
      await oracleTester.write(100, 100, 1000);
      await oracleTester.write(200, 200, 2000);
      
      // Test case that triggers the right boundary path
      const result = await oracleTester.observeSingle(200, 0, 2, 1000);
      expect(result.tickCumulative).to.be.gt(0);
      expect(result.secondsPerLiquidityCumulativeX128).to.be.gt(0);
    });
  });

  describe("observe - Edge Cases", () => {
    it("should handle multiple secondsAgos with edge cases", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add multiple observations
      await oracleTester.grow(3);
      await oracleTester.write(100, 100, 1000);
      await oracleTester.write(200, 200, 2000);
      await oracleTester.write(300, 300, 3000);
      
      // Test case that might trigger line 274
      const secondsAgos = [0, 50, 100, 150, 200];
      const result = await oracleTester.observe(300, secondsAgos, 3, 1000);
      
      expect(result.tickCumulatives).to.have.length(5);
      expect(result.secondsPerLiquidityCumulativeX128s).to.have.length(5);
    });

    it("should handle edge case with single observation", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Add single observation
      await oracleTester.write(100, 100, 1000);
      
      // Test with single secondsAgo
      const secondsAgos = [0];
      const result = await oracleTester.observe(100, secondsAgos, 1, 1000);
      
      expect(result.tickCumulatives).to.have.length(1);
      expect(result.secondsPerLiquidityCumulativeX128s).to.have.length(1);
    });

    it("should handle edge case with empty secondsAgos array", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Test with empty array
      const secondsAgos: number[] = [];
      const result = await oracleTester.observe(100, secondsAgos, 1, 1000);
      
      expect(result.tickCumulatives).to.have.length(0);
      expect(result.secondsPerLiquidityCumulativeX128s).to.have.length(0);
    });
  });

  describe("transform - Edge Cases", () => {
    it("should handle transformation with zero time delta", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Test transformation with same timestamp
      const result = await oracleTester.observeSingle(100, 0, 1, 1000);
      expect(result.tickCumulative).to.equal(0);
      expect(result.secondsPerLiquidityCumulativeX128).to.equal(0);
    });

    it("should handle transformation with very small time delta", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Test transformation with minimal time difference
      const result = await oracleTester.observeSingle(101, 1, 1, 1000);
      expect(result.tickCumulative).to.equal(0n);
      expect(result.secondsPerLiquidityCumulativeX128).to.equal(0);
    });
  });

  describe("grow - Edge Cases", () => {
    it("should handle growing from zero cardinality", async () => {
      // Test growing from zero
      await oracleTester.grow(10);
      const cardinalityNext = await oracleTester.cardinalityNext();
      expect(cardinalityNext).to.equal(10);
    });

    it("should handle growing to maximum cardinality", async () => {
      // Test growing to a large number
      await oracleTester.grow(1000);
      const cardinalityNext = await oracleTester.cardinalityNext();
      expect(cardinalityNext).to.equal(1000);
    });

    it("should handle growing with same cardinality", async () => {
      // Test growing with same value
      await oracleTester.grow(10);
      await oracleTester.grow(10);
      const cardinalityNext = await oracleTester.cardinalityNext();
      expect(cardinalityNext).to.equal(10);
    });
  });

  describe("write - Edge Cases", () => {
    it("should handle writing with zero tick", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Write observation with zero tick
      await oracleTester.write(100, 0, 1000);
      
      const result = await oracleTester.observeSingle(100, 0, 1, 1000);
      expect(result.tickCumulative).to.equal(0);
    });

    it("should handle writing with maximum tick", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Write observation with maximum tick
      const maxTick = 887272;
      await oracleTester.write(100, maxTick, 1000);
      
      const result = await oracleTester.observeSingle(100, 0, 1, 1000);
      expect(result.tickCumulative).to.equal(0);
    });

    it("should handle writing with zero liquidity", async () => {
      // Initialize oracle
      await oracleTester.initialize(100);
      
      // Write observation with zero liquidity
      await oracleTester.write(100, 100, 0);
      
      const result = await oracleTester.observeSingle(100, 0, 1, 0);
      expect(result.secondsPerLiquidityCumulativeX128).to.equal(0);
    });
  });
}); 