import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("BitMath Library", function () {
    let testBitMath: Contract;

    before(async function () {
        const TestBitMath = await ethers.getContractFactory("TestBitMathLib");
        testBitMath = await TestBitMath.deploy();
    });

    describe("mostSignificantBit", function () {
        it("should return correct MSB for powers of 2", async function () {
            expect(await testBitMath.msb(1)).to.equal(0);
            expect(await testBitMath.msb(2)).to.equal(1);
            expect(await testBitMath.msb(4)).to.equal(2);
            expect(await testBitMath.msb(8)).to.equal(3);
            expect(await testBitMath.msb(16)).to.equal(4);
            expect(await testBitMath.msb(32)).to.equal(5);
            expect(await testBitMath.msb(64)).to.equal(6);
            expect(await testBitMath.msb(128)).to.equal(7);
            expect(await testBitMath.msb(256)).to.equal(8);
        });

        it("should return correct MSB for non-powers of 2", async function () {
            expect(await testBitMath.msb(3)).to.equal(1);
            expect(await testBitMath.msb(5)).to.equal(2);
            expect(await testBitMath.msb(7)).to.equal(2);
            expect(await testBitMath.msb(9)).to.equal(3);
            expect(await testBitMath.msb(15)).to.equal(3);
            expect(await testBitMath.msb(17)).to.equal(4);
            expect(await testBitMath.msb(31)).to.equal(4);
            expect(await testBitMath.msb(33)).to.equal(5);
        });

        it("should return correct MSB for large numbers", async function () {
            expect(await testBitMath.msb(2n ** 64n)).to.equal(64);
            expect(await testBitMath.msb(2n ** 128n)).to.equal(128);
            expect(await testBitMath.msb(2n ** 255n)).to.equal(255);
        });

        it("should revert for zero", async function () {
            await expect(testBitMath.msb(0)).to.be.reverted;
        });
    });

    describe("leastSignificantBit", function () {
        it("should return correct LSB for powers of 2", async function () {
            expect(await testBitMath.lsb(1)).to.equal(0);
            expect(await testBitMath.lsb(2)).to.equal(1);
            expect(await testBitMath.lsb(4)).to.equal(2);
            expect(await testBitMath.lsb(8)).to.equal(3);
            expect(await testBitMath.lsb(16)).to.equal(4);
            expect(await testBitMath.lsb(32)).to.equal(5);
            expect(await testBitMath.lsb(64)).to.equal(6);
            expect(await testBitMath.lsb(128)).to.equal(7);
            expect(await testBitMath.lsb(256)).to.equal(8);
        });

        it("should return correct LSB for non-powers of 2", async function () {
            expect(await testBitMath.lsb(3)).to.equal(0);
            expect(await testBitMath.lsb(5)).to.equal(0);
            expect(await testBitMath.lsb(6)).to.equal(1);
            expect(await testBitMath.lsb(7)).to.equal(0);
            expect(await testBitMath.lsb(9)).to.equal(0);
            expect(await testBitMath.lsb(10)).to.equal(1);
            expect(await testBitMath.lsb(12)).to.equal(2);
            expect(await testBitMath.lsb(14)).to.equal(1);
        });

        it("should return correct LSB for large numbers", async function () {
            expect(await testBitMath.lsb(2n ** 64n)).to.equal(64);
            expect(await testBitMath.lsb(2n ** 128n)).to.equal(128);
            expect(await testBitMath.lsb(2n ** 255n)).to.equal(255);
        });

        it("should revert for zero", async function () {
            await expect(testBitMath.lsb(0)).to.be.reverted;
        });
    });
}); 