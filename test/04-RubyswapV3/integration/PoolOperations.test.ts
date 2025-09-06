import { ethers } from "hardhat";
import { expect } from "chai";

describe("Pool Operations (skeleton)", () => {
    it("deploys MockERC20 tokens", async () => {
        const Token = await ethers.getContractFactory("MockERC20");
        const tokenA = await Token.deploy("TokenA", "TKA", 18);
        await tokenA.waitForDeployment();
        const tokenB = await Token.deploy("TokenB", "TKB", 6);
        await tokenB.waitForDeployment();
        expect(await tokenA.decimals()).to.equal(18);
        expect(await tokenB.decimals()).to.equal(6);
    });
}); 