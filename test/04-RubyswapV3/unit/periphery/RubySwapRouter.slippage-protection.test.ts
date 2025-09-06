import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractTransactionResponse } from "ethers";

describe("RubySwapRouter - Slippage Protection Audit (Agent B)", function () {
    let deployer: any, user1: any;
    let factory: any, router: any, timelock: any;
    let token0: any, token1: any, token2: any;
    let pool1: any, pool2: any;
    let positionManager: any;

    beforeEach(async function () {
        [deployer, user1] = await ethers.getSigners();

        // Deploy contracts
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
        router = await RubySwapRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
        await router.waitForDeployment();

        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            await factory.getAddress(), 
            ethers.ZeroAddress, 
            "Position", 
            "POS"
        );
        await positionManager.waitForDeployment();

        // Deploy tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "T0", 18);
        token1 = await MockERC20.deploy("Token1", "T1", 18);
        token2 = await MockERC20.deploy("Token2", "T2", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();
        await token2.waitForDeployment();

        // Set up oracle feeds
        const oracleAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracle = OracleRegistry.attach(oracleAddr);

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const feed0 = await MockAggregatorV3.deploy(200000000000);  // $2000
        const feed1 = await MockAggregatorV3.deploy(100000000);     // $1
        const feed2 = await MockAggregatorV3.deploy(150000000000);  // $1500
        await feed0.waitForDeployment();
        await feed1.waitForDeployment();
        await feed2.waitForDeployment();

        await oracle.setFeed(await token0.getAddress(), await feed0.getAddress());
        await oracle.setFeed(await token1.getAddress(), await feed1.getAddress());
        await oracle.setFeed(await token2.getAddress(), await feed2.getAddress());

        // Create pools
        await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
        await factory.createPool(await token1.getAddress(), await token2.getAddress(), 3000);

        const pool1Addr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const pool2Addr = await factory.getPool(await token1.getAddress(), await token2.getAddress(), 3000);
        const RubySwapPool = await ethers.getContractFactory("RubySwapPool");
        pool1 = RubySwapPool.attach(pool1Addr);
        pool2 = RubySwapPool.attach(pool2Addr);

        // Initialize pools
        await pool1.initialize("79228162514264337593543950336"); // 1:1 price
        await pool2.initialize("79228162514264337593543950336"); // 1:1 price

        // Mint tokens to users
        await token0.mint(deployer.address, ethers.parseEther("1000"));
        await token1.mint(deployer.address, ethers.parseEther("1000"));
        await token2.mint(deployer.address, ethers.parseEther("1000"));
        await token0.mint(user1.address, ethers.parseEther("100"));
        await token1.mint(user1.address, ethers.parseEther("100"));
        await token2.mint(user1.address, ethers.parseEther("100"));

        // Add liquidity
        const mintParams = {
            token0: await token0.getAddress(),
            token1: await token1.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("50"),
            amount1Desired: ethers.parseEther("50"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: deployer.address,
            deadline: Math.floor(Date.now() / 1000) + 3600
        };

        await token0.approve(await positionManager.getAddress(), mintParams.amount0Desired);
        await token1.approve(await positionManager.getAddress(), mintParams.amount1Desired);
        await positionManager.mint(mintParams);

        // Add liquidity to second pool
        const mintParams2 = {
            token0: await token1.getAddress(),
            token1: await token2.getAddress(),
            fee: 3000,
            tickLower: -60,
            tickUpper: 60,
            amount0Desired: ethers.parseEther("50"),
            amount1Desired: ethers.parseEther("50"),
            amount0Min: 0,
            amount1Min: 0,
            recipient: deployer.address,
            deadline: Math.floor(Date.now() / 1000) + 3600
        };

        await token1.approve(await positionManager.getAddress(), mintParams2.amount0Desired);
        await token2.approve(await positionManager.getAddress(), mintParams2.amount1Desired);
        await positionManager.mint(mintParams2);
    });

    describe("CRITICAL: Slippage Protection Vulnerabilities", function () {
        it("VULN-004 CRITICAL: Router allows zero slippage protection", async function () {
            const swapAmount = ethers.parseEther("1");
            
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);
            
            const params = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0, // now forbidden
                sqrtPriceLimitX96: 0
            };

            await expect(
                router.connect(user1).exactInputSingle(params)
            ).to.be.revertedWith("Zero slippage forbidden");
        });

        it("VULN-005 HIGH: Router exactOutput allows unlimited input amount", async function () {
            const swapAmount = ethers.parseEther("0.5");
            await token0.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
            
            const params = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountOut: swapAmount,
                amountInMaximum: ethers.MaxUint256, // now forbidden (too high)
                sqrtPriceLimitX96: 0
            };

            await expect(
                router.connect(user1).exactOutputSingle(params)
            ).to.be.revertedWith("Input limit too high");
        });

        it("VULN-006 MEDIUM: Multi-hop slippage only checked at end", async function () {
            const path = ethers.solidityPacked(
                ["address", "uint24", "address", "uint24", "address"],
                [await token0.getAddress(), 3000, await token1.getAddress(), 3000, await token2.getAddress()]
            );

            const swapAmount = ethers.parseEther("1");
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);

            const params = {
                path: path,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: ethers.parseEther("0.9") // enforce non-zero slippage protection
            };

            const tx = await router.connect(user1).exactInput(params);
            const receipt = await tx.wait();
            expect(receipt.status).to.equal(1);
        });
    });

    describe("CRITICAL: Deadline Protection Vulnerabilities", function () {
        it("VULN-007 HIGH: Expired deadline still allows execution", async function () {
            const swapAmount = ethers.parseEther("1");
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);

            const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

            const params = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: user1.address,
                deadline: expiredDeadline,
                amountIn: swapAmount,
                amountOutMinimum: ethers.parseEther("0.9"), // valid non-zero min
                sqrtPriceLimitX96: 0
            };

            await expect(
                router.connect(user1).exactInputSingle(params)
            ).to.be.revertedWith("Transaction too old");
        });

        it("VULN-008 MEDIUM: Deadline can be set very far in future", async function () {
            const swapAmount = ethers.parseEther("1");
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);

            const farFutureDeadline = Math.floor(Date.now() / 1000) + (365 * 24 * 3600); // 1 year

            const params = {
                tokenIn: await token0.getAddress(),
                tokenOut: await token1.getAddress(),
                fee: 3000,
                recipient: user1.address,
                deadline: farFutureDeadline,
                amountIn: swapAmount,
                amountOutMinimum: ethers.parseEther("0.9"),
                sqrtPriceLimitX96: 0
            };

            await expect(
                router.connect(user1).exactInputSingle(params)
            ).to.be.revertedWith("Deadline too far");
        });
    });

    describe("CRITICAL: Path Validation Vulnerabilities", function () {
        it("VULN-009 HIGH: Malformed path encoding accepted", async function () {
            // Create malformed path (wrong length)
            const malformedPath = ethers.solidityPacked(
                ["address", "uint24"],
                [await token0.getAddress(), 3000] // Missing second token
            );

            const swapAmount = ethers.parseEther("1");
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);

            const params = {
                path: malformedPath, // MALFORMED PATH
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0
            };

            // This should revert gracefully
            await expect(
                router.connect(user1).exactInput(params)
            ).to.be.reverted; // Should catch malformed paths
            
            console.log("✅ GOOD: Malformed path properly rejected");
        });

        it("VULN-010 HIGH: Self-referential path allowed", async function () {
            // Path that goes from token to itself
            const selfPath = ethers.solidityPacked(
                ["address", "uint24", "address"],
                [await token0.getAddress(), 3000, await token0.getAddress()]
            );

            const swapAmount = ethers.parseEther("1");
            await token0.connect(user1).approve(await router.getAddress(), swapAmount);

            const params = {
                path: selfPath, // SELF-REFERENTIAL PATH
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600,
                amountIn: swapAmount,
                amountOutMinimum: 0
            };

            // This should be rejected
            await expect(
                router.connect(user1).exactInput(params)
            ).to.be.reverted;
            
            console.log("🟡 Path validation: Self-referential path test");
        });
    });

    describe("Callback Validation Security", function () {
        it("VULN-011 CRITICAL: Callback validation bypass", async function () {
            // This test attempts to bypass callback validation by calling rubySwapV3SwapCallback directly
            const fakeCallbackData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint24", "address"],
                [await token0.getAddress(), await token1.getAddress(), 3000, user1.address]
            );

            // Direct callback call should be rejected
            await expect(
                router.rubySwapV3SwapCallback(
                    ethers.parseEther("1"), // amount0Delta
                    0, // amount1Delta
                    fakeCallbackData
                )
            ).to.be.revertedWith("Invalid pool callback");
            
            console.log("✅ GOOD: Direct callback calls properly rejected");
        });
    });
}); 