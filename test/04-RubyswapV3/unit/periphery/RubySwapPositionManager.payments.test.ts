import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapPositionManager - Payment Functions", function () {
    it("unwrapWETH9 unwraps WETH and sends to recipient", async () => {
        const [deployer, user] = await ethers.getSigners();
        
        const MockWETH9 = await ethers.getContractFactory("MockWETH9");
        const mockWeth = await MockWETH9.deploy();
        await mockWeth.waitForDeployment();
        
        const PositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PositionManager.deploy(ethers.ZeroAddress, await mockWeth.getAddress(), "RubySwap V3 Positions NFT-V1", "RUBY-V3-POS");
        await pm.waitForDeployment();
        
        // Send WETH to PM
        await mockWeth.connect(user).deposit({ value: ethers.parseEther("1") });
        await mockWeth.connect(user).transfer(await pm.getAddress(), ethers.parseEther("1"));
        
        const balanceBefore = await ethers.provider.getBalance(user.address);
        
        // Unwrap WETH
        await pm.connect(user).unwrapWETH9(ethers.parseEther("1"), user.address);
        
        const balanceAfter = await ethers.provider.getBalance(user.address);
        expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("sweepToken sends tokens to recipient", async () => {
        const [deployer, user] = await ethers.getSigners();
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const token0 = await MockERC20.deploy("Token0", "TK0", 18);
        await token0.waitForDeployment();
        
        const MockWETH9 = await ethers.getContractFactory("MockWETH9");
        const mockWeth = await MockWETH9.deploy();
        await mockWeth.waitForDeployment();
        
        const PositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PositionManager.deploy(ethers.ZeroAddress, await mockWeth.getAddress(), "RubySwap V3 Positions NFT-V1", "RUBY-V3-POS");
        await pm.waitForDeployment();
        
        // Mint tokens to user first
        await token0.mint(user.address, ethers.parseEther("10"));
        const initialBalance = await token0.balanceOf(user.address);
        
        // Send tokens to PM
        await token0.connect(user).transfer(await pm.getAddress(), ethers.parseEther("1"));
        
        // Sweep tokens
        await pm.connect(user).sweepToken(await token0.getAddress(), ethers.parseEther("1"), user.address);
        
        const finalBalance = await token0.balanceOf(user.address);
        expect(finalBalance).to.equal(initialBalance);
    });

    it("multicall executes multiple operations", async () => {
        const [deployer, user] = await ethers.getSigners();
        
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const token0 = await MockERC20.deploy("Token0", "TK0", 18);
        await token0.waitForDeployment();
        
        const MockWETH9 = await ethers.getContractFactory("MockWETH9");
        const mockWeth = await MockWETH9.deploy();
        await mockWeth.waitForDeployment();
        
        const PositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        const pm = await PositionManager.deploy(ethers.ZeroAddress, await mockWeth.getAddress(), "RubySwap V3 Positions NFT-V1", "RUBY-V3-POS");
        await pm.waitForDeployment();
        
        // Mint tokens to user first
        await token0.mint(user.address, ethers.parseEther("10"));
        
        // Send tokens to PM
        await token0.connect(user).transfer(await pm.getAddress(), ethers.parseEther("1"));
        
        // Multicall: sweep token
        const calls = [
            pm.interface.encodeFunctionData("sweepToken", [
                await token0.getAddress(),
                ethers.parseEther("1"),
                user.address
            ])
        ];
        
        await pm.connect(user).multicall(calls);
        
        // Verify token was swept
        const pmTokenBalance = await token0.balanceOf(await pm.getAddress());
        expect(pmTokenBalance).to.equal(0);
    });
}); 