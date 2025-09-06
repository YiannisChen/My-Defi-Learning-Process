import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RubySwapRouter Self-Permit Allowed (DAI-style)", function () {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let router: any;
    let token: any;

    beforeEach(async () => {
        [deployer, user] = await ethers.getSigners();

        // Deploy Router with dummy factory/WETH9 (not used in these tests)
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();
        const factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        // Deploy mock DAI-style token with permitAllowed
        const TestERC20PermitAllowed = await ethers.getContractFactory("TestERC20PermitAllowed");
        token = await TestERC20PermitAllowed.deploy("DAI-Style", "DAIP", 18);
        await token.waitForDeployment();

        // Fund user
        await token.mint(user.address, ethers.parseEther("10"));
    });

    it("selfPermitAllowed sets allowance to max", async () => {
        const nonce = 0;
        const expiry = ethers.MaxUint256;
        const v = 27; // unused in mock
        const r = "0x" + "00".repeat(32);
        const s = "0x" + "00".repeat(32);

        // Pre: allowance is 0
        const pre = await token.allowance(user.address, await router.getAddress());
        expect(pre).to.equal(0n);

        // Call as user
        await router.connect(user).selfPermitAllowed(token.target, nonce, expiry, v, r, s);

        const post = await token.allowance(user.address, await router.getAddress());
        expect(post).to.equal(ethers.MaxUint256);
    });

    it("selfPermitAllowedIfNecessary is idempotent when already max", async () => {
        const nonce = 0;
        const expiry = ethers.MaxUint256;
        const v = 27;
        const r = "0x" + "00".repeat(32);
        const s = "0x" + "00".repeat(32);

        // First set to max
        await router.connect(user).selfPermitAllowed(token.target, nonce, expiry, v, r, s);
        const post = await token.allowance(user.address, await router.getAddress());
        expect(post).to.equal(ethers.MaxUint256);

        // Then call IfNecessary - should not revert and keep max
        await expect(
            router.connect(user).selfPermitAllowedIfNecessary(token.target, nonce, expiry, v, r, s)
        ).to.not.be.reverted;
        const post2 = await token.allowance(user.address, await router.getAddress());
        expect(post2).to.equal(ethers.MaxUint256);
    });

    it("selfPermitAllowedIfNecessary upgrades allowance when below max", async () => {
        const nonce = 0;
        const expiry = ethers.MaxUint256;
        const v = 27;
        const r = "0x" + "00".repeat(32);
        const s = "0x" + "00".repeat(32);

        // Set small allowance directly
        await token.connect(user).approve(await router.getAddress(), ethers.parseEther("1"));
        const pre = await token.allowance(user.address, await router.getAddress());
        expect(pre).to.equal(ethers.parseEther("1"));

        // Call IfNecessary - should bump to max
        await router.connect(user).selfPermitAllowedIfNecessary(token.target, nonce, expiry, v, r, s);
        const post = await token.allowance(user.address, await router.getAddress());
        expect(post).to.equal(ethers.MaxUint256);
    });
}); 