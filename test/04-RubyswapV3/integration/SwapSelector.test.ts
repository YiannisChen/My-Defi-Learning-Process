import { expect } from "chai";
import { ethers } from "hardhat";

describe("Swap selector diagnostic", function () {
    it("should match the expected swap selector 0x128acb08", async function () {
        const sigHash = ethers.id("swap(address,bool,int256,uint160,bytes)").slice(0, 10);
        expect(sigHash).to.equal("0x128acb08");
    });
}); 