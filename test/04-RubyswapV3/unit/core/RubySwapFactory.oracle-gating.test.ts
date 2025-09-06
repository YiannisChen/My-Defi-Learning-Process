import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, SignerWithAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("RubySwapFactory Oracle Gating", function () {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let factory: Contract;
    let oracleRegistry: Contract;
    let token0: Contract;
    let token1: Contract;
    let token2: Contract;
    let feed0: Contract;
    let feed1: Contract;
    let feed2: Contract;

    async function deployFixture() {
        [deployer, user] = await ethers.getSigners();

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "TK0", 18);
        token1 = await MockERC20.deploy("Token1", "TK1", 18);
        token2 = await MockERC20.deploy("Token2", "TK2", 18);

        // Deploy mock feeds
        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        feed0 = await MockAggregatorV3.deploy(100000000n); // 1.0 with 8 decimals
        feed1 = await MockAggregatorV3.deploy(100000000n);
        feed2 = await MockAggregatorV3.deploy(100000000n);

        // Deploy timelock
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        const timelock = await RubySwapTimelock.deploy([], [], deployer.address);

        // Deploy factory (creates its own OracleRegistry and assigns ownership to deployer)
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());

        // Get the factory's OracleRegistry instance
        const registryAddr = await factory.oracleRegistry();
        oracleRegistry = await ethers.getContractAt("OracleRegistry", registryAddr);

        return { deployer, user, factory, oracleRegistry, token0, token1, token2, feed0, feed1, feed2 };
    }

    describe("Oracle Feed Requirements", function () {
        it("should reject pool creation when neither token has feeds", async function () {
            const { factory, token0, token1 } = await loadFixture(deployFixture);

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
        });

        it("should reject pool creation when only token0 has feed", async function () {
            const { factory, oracleRegistry, token0, token1, feed0 } = await loadFixture(deployFixture);

            // Set feed only for token0
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
        });

        it("should reject pool creation when only token1 has feed", async function () {
            const { factory, oracleRegistry, token0, token1, feed1 } = await loadFixture(deployFixture);

            // Set feed only for token1
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
        });

        it("should allow pool creation when both tokens have feeds", async function () {
            const { factory, oracleRegistry, token0, token1, feed0, feed1 } = await loadFixture(deployFixture);

            // Set feeds for both tokens
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.not.be.reverted;
        });

        it("should allow pool creation with different fee tiers when feeds exist", async function () {
            const { factory, oracleRegistry, token0, token1, feed0, feed1 } = await loadFixture(deployFixture);

            // Set feeds for both tokens
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            // Create pools with different fee tiers
            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 500)
            ).to.not.be.reverted;

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.not.be.reverted;

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 10000)
            ).to.not.be.reverted;
        });

        it("should reject pool creation for disabled feeds", async function () {
            const { factory, oracleRegistry, token0, token1, feed0, feed1 } = await loadFixture(deployFixture);

            // Set feeds for both tokens
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            // Disable one feed
            await oracleRegistry.disableFeed(await token0.getAddress(), "maintenance");

            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");
        });

        it("should handle feed updates correctly", async function () {
            const { factory, oracleRegistry, token0, token1, feed0, feed1, feed2 } = await loadFixture(deployFixture);

            // Set initial feeds
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            // Create pool
            await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);

            // Update feed for token0
            await oracleRegistry.setFeed(await token0.getAddress(), await feed2.getAddress());

            // Should still be able to create pools with the new feed
            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 500)
            ).to.not.be.reverted;
        });

        it("should enforce oracle requirements for all pool creation attempts", async function () {
            const { factory, oracleRegistry, token0, token1, token2, feed0, feed1 } = await loadFixture(deployFixture);

            // Set feeds for token0 and token1 only
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            // Should reject token0-token2 pool (token2 has no feed)
            await expect(
                factory.createPool(await token0.getAddress(), await token2.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");

            // Should reject token1-token2 pool (token2 has no feed)
            await expect(
                factory.createPool(await token1.getAddress(), await token2.getAddress(), 3000)
            ).to.be.revertedWith("MISSING_ORACLE_FEEDS");

            // Should allow token0-token1 pool (both have feeds)
            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.not.be.reverted;
        });
    });

    describe("Oracle Registry Integration", function () {
        it("should use factory's oracle registry for validation", async function () {
            const { factory, oracleRegistry, token0, token1, feed0, feed1 } = await loadFixture(deployFixture);

            // Set feeds in factory's oracle registry
            await oracleRegistry.setFeed(await token0.getAddress(), await feed0.getAddress());
            await oracleRegistry.setFeed(await token1.getAddress(), await feed1.getAddress());

            // Create pool should succeed
            await expect(
                factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000)
            ).to.not.be.reverted;

            // Verify pool was created
            const poolAddress = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
            expect(poolAddress).to.not.equal(ethers.ZeroAddress);
        });
    });
}); 