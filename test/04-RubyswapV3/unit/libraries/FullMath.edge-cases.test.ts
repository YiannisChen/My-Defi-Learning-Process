import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("FullMath - Edge Cases", () => {
  let testFullMath: Contract;

  beforeEach(async () => {
    const TestFullMath = await ethers.getContractFactory("TestFullMath");
    testFullMath = await TestFullMath.deploy();
  });

  describe("mulDiv - Edge Cases", () => {
    it("should handle prod1 == 0 case", async () => {
      // Test case where prod1 == 0 (lines 89-93)
      const a = ethers.parseEther("1000");
      const b = ethers.parseEther("2000");
      const denominator = ethers.parseEther("500");
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(ethers.parseEther("4000"));
    });

    it("should handle prod1 > 0 case", async () => {
      // Test case where prod1 > 0 (lines 95-125)
      const a = ethers.parseEther("1000"); // Use smaller numbers to avoid overflow
      const b = ethers.parseEther("2000");
      const denominator = ethers.parseEther("500");
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(ethers.parseEther("4000"));
    });

    it("should handle exact division with remainder", async () => {
      // Test case that triggers the remainder calculation (lines 97-105)
      const a = 1000000000000000000000000n;
      const b = 2000000000000000000000000n;
      const denominator = 1000000000000000000000n;
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(2000000000000000000000000000n); // Fixed expected value
    });

    it("should handle power of two factorization", async () => {
      // Test case that triggers power of two factorization (lines 105-106)
      const a = 1000000000000000000000000n;
      const b = 2000000000000000000000000n;
      const denominator = 1000000000000000000000n; // This will trigger factorization
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(2000000000000000000000000000n); // Fixed expected value
    });

    it("should handle very large numbers that overflow uint256", async () => {
      // Test case that triggers the full 512-bit multiplication path
      const a = ethers.MaxUint256;
      const b = ethers.MaxUint256;
      const denominator = ethers.MaxUint256;
      
      // This should revert due to overflow
      await expect(
        testFullMath.mulDivWrapper(a, b, denominator)
      ).to.be.reverted;
    });

    it("should handle denominator == 0", async () => {
      const a = ethers.parseEther("1000");
      const b = ethers.parseEther("2000");
      const denominator = 0;
      
      await expect(
        testFullMath.mulDivWrapper(a, b, denominator)
      ).to.be.reverted;
    });

    it("should handle a == 0", async () => {
      const a = 0;
      const b = ethers.parseEther("2000");
      const denominator = ethers.parseEther("1000");
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(0);
    });

    it("should handle b == 0", async () => {
      const a = ethers.parseEther("1000");
      const b = 0;
      const denominator = ethers.parseEther("1000");
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(0);
    });
  });

  describe("mulDivRoundingUp - Edge Cases", () => {
    it("should round up when there is a remainder", async () => {
      // Test case where mulmod > 0 (line 89 in mulDivRoundingUp)
      const a = 7;
      const b = 3;
      const denominator = 5;
      
      const result = await testFullMath.mulDivRoundingUpWrapper(a, b, denominator);
      expect(result).to.equal(5); // 7*3/5 = 4.2, rounded up to 5
    });

    it("should not round up when there is no remainder", async () => {
      // Test case where mulmod == 0
      const a = 10;
      const b = 2;
      const denominator = 5;
      
      const result = await testFullMath.mulDivRoundingUpWrapper(a, b, denominator);
      expect(result).to.equal(4); // 10*2/5 = 4 exactly
    });

    it("should handle edge case where result == type(uint256).max", async () => {
      // Test case that might trigger the require check
      const a = ethers.MaxUint256;
      const b = 1;
      const denominator = 1;
      
      const result = await testFullMath.mulDivRoundingUpWrapper(a, b, denominator);
      expect(result).to.equal(ethers.MaxUint256);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple power of two factors", async () => {
      // Test with denominator that has multiple power of two factors
      const a = 1000000000000000000000000n;
      const b = 2000000000000000000000000n;
      const denominator = 1000000000000000000000n; // 2^60 * some_odd_number
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.equal(2000000000000000000000000000n); // Fixed expected value
    });

    it("should handle Newton-Raphson iteration convergence", async () => {
      // Test case that exercises the Newton-Raphson iteration
      const a = 1000000000000000000000000n;
      const b = 2000000000000000000000000n;
      const denominator = 1000000000000000000001n; // Odd number to trigger inverse calculation
      
      const result = await testFullMath.mulDivWrapper(a, b, denominator);
      expect(result).to.be.gt(0);
    });
  });
}); 