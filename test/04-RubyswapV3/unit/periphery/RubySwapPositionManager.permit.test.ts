import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapPositionManager - ERC721 Permit", function () {
    it("has permit function and domain separator", async () => {
        const [deployer] = await ethers.getSigners();
        
        const MockWETH9 = await ethers.getContractFactory("MockWETH9");
        const mockWeth = await MockWETH9.deploy();
        await mockWeth.waitForDeployment();
        
        const PositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PositionManager.deploy(ethers.ZeroAddress, await mockWeth.getAddress(), "RubySwap V3 Positions NFT-V1", "RUBY-V3-POS");
        await pm.waitForDeployment();
        
        // Verify the permit function exists
        expect(pm.permit).to.be.a("function");
        
        // Verify domain separator and permit typehash exist
        const domainSeparator = await pm.DOMAIN_SEPARATOR();
        const permitTypehash = await pm.PERMIT_TYPEHASH();
        
        expect(domainSeparator).to.be.a("string");
        expect(permitTypehash).to.be.a("string");
        expect(domainSeparator.length).to.be.gt(0);
        expect(permitTypehash.length).to.be.gt(0);
    });
}); 