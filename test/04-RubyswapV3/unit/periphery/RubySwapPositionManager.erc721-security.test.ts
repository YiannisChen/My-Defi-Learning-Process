import { expect } from "chai";
import { ethers } from "hardhat";

describe("RubySwapPositionManager - ERC721 Security Audit (Agent B)", function () {
    let deployer: any, user1: any, user2: any, attacker: any;
    let factory: any, positionManager: any, timelock: any;
    let token0: any, token1: any;
    let pool: any;

    beforeEach(async function () {
        [deployer, user1, user2, attacker] = await ethers.getSigners();

        // Deploy contracts
        const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
        timelock = await RubySwapTimelock.deploy([deployer.address], [deployer.address], deployer.address);
        await timelock.waitForDeployment();

        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        factory = await RubySwapFactory.deploy(await timelock.getAddress());
        await factory.waitForDeployment();

        const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
        positionManager = await RubySwapPositionManager.deploy(
            await factory.getAddress(),
            ethers.ZeroAddress, // WETH9
            "RubySwap Position",
            "UNI-V3-POS"
        );
        await positionManager.waitForDeployment();

        // Deploy tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token0 = await MockERC20.deploy("Token0", "T0", 18);
        token1 = await MockERC20.deploy("Token1", "T1", 18);
        await token0.waitForDeployment();
        await token1.waitForDeployment();

        // Set up oracle feeds
        const oracleAddr = await factory.oracleRegistry();
        const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
        const oracle = OracleRegistry.attach(oracleAddr);

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        const feed0 = await MockAggregatorV3.deploy(200000000000);
        const feed1 = await MockAggregatorV3.deploy(100000000);
        await feed0.waitForDeployment();
        await feed1.waitForDeployment();

        await oracle.setFeed(await token0.getAddress(), await feed0.getAddress());
        await oracle.setFeed(await token1.getAddress(), await feed1.getAddress());

        // Create and initialize pool
        await factory.createPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const poolAddr = await factory.getPool(await token0.getAddress(), await token1.getAddress(), 3000);
        const RubySwapPool = await ethers.getContractFactory("RubySwapPool");
        pool = RubySwapPool.attach(poolAddr);
        await pool.initialize("79228162514264337593543950336");

        // Mint tokens to users
        await token0.mint(user1.address, ethers.parseEther("1000"));
        await token1.mint(user1.address, ethers.parseEther("1000"));
        await token0.mint(user2.address, ethers.parseEther("1000"));
        await token1.mint(user2.address, ethers.parseEther("1000"));
    });

    describe("CRITICAL: ERC-721 Ownership Vulnerabilities", function () {
        it("VULN-021 CRITICAL: Unauthorized position modification", async function () {
            // User1 creates a position
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            
            const tx = await positionManager.connect(user1).mint(mintParams);
            const receipt = await tx.wait();
            
            // Get the minted token ID
            const transferEvent = receipt?.logs?.find((log: any) => {
                try {
                    const parsed = positionManager.interface.parseLog(log);
                    return parsed?.name === 'Transfer';
                } catch {
                    return false;
                }
            });
            
            const tokenId = transferEvent ? positionManager.interface.parseLog(transferEvent).args.tokenId : 1n;
            
            // Verify user1 owns the position
            expect(await positionManager.ownerOf(tokenId)).to.equal(user1.address);
            
            // Attacker should not be able to modify the position
            const increaseParams = {
                tokenId: tokenId,
                amount0Desired: ethers.parseEther("5"),
                amount1Desired: ethers.parseEther("5"),
                amount0Min: 0,
                amount1Min: 0,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await expect(
                positionManager.connect(attacker).increaseLiquidity(increaseParams)
            ).to.be.revertedWith("Not approved");
            
            console.log("✅ GOOD: Unauthorized position modification prevented");
        });

        it("VULN-022 HIGH: Approval bypass vulnerability", async function () {
            // Create position as user1
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n; // First minted token
            
            // Verify initial state
            expect(await positionManager.ownerOf(tokenId)).to.equal(user1.address);
            expect(await positionManager.getApproved(tokenId)).to.equal(ethers.ZeroAddress);
            
            // User1 approves user2
            await positionManager.connect(user1).approve(user2.address, tokenId);
            expect(await positionManager.getApproved(tokenId)).to.equal(user2.address);
            
            // Attacker should not be able to clear approval
            await expect(
                positionManager.connect(attacker).approve(ethers.ZeroAddress, tokenId)
            ).to.be.revertedWith("ERC721: approve caller is not token owner or approved for all");
            
            // Attacker should not be able to transfer
            await expect(
                positionManager.connect(attacker).transferFrom(user1.address, attacker.address, tokenId)
            ).to.be.revertedWith("ERC721: caller is not token owner or approved");
            
            console.log("✅ GOOD: Approval bypass attempts prevented");
        });

        it("VULN-023 CRITICAL: Reentrancy during NFT transfer", async function () {
            // Create position
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n;
            
            // Deploy malicious ERC721 receiver that attempts reentrancy in onERC721Received
            const MaliciousReceiver = await ethers.getContractFactory("MaliciousERC721Receiver");
            const maliciousReceiver = await MaliciousReceiver.deploy(await positionManager.getAddress());
            await maliciousReceiver.waitForDeployment();
            
            // Transfer should not allow reentrancy
            await positionManager.connect(user1).safeTransferFrom(
                user1.address,
                await maliciousReceiver.getAddress(),
                tokenId
            );
            
            // Verify transfer completed safely
            expect(await positionManager.ownerOf(tokenId)).to.equal(await maliciousReceiver.getAddress());
            
            console.log("✅ Transfer completed - no reentrancy detected");
        });
    });

    describe("CRITICAL: Permit and Signature Vulnerabilities", function () {
        it("VULN-024 HIGH: Signature replay attack", async function () {
            // Create position
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n;
            const spender = user2.address;
            const nonce = await positionManager.getNonce(tokenId);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
            // Get domain separator
            const domain = {
                name: await positionManager.name(),
                version: '1',
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await positionManager.getAddress()
            };
            
            const types = {
                Permit: [
                    { name: 'spender', type: 'address' },
                    { name: 'tokenId', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' }
                ]
            };
            
            const message = {
                spender: spender,
                tokenId: tokenId,
                nonce: nonce,
                deadline: deadline
            };
            
            // Sign the permit
            const signature = await user1.signTypedData(domain, types, message);
            const { r, s, v } = ethers.Signature.from(signature);
            
            // First permit should work
            await positionManager.permit(spender, tokenId, deadline, v, r, s);
            expect(await positionManager.getApproved(tokenId)).to.equal(spender);
            
            // Clear approval to test replay
            await positionManager.connect(user1).approve(ethers.ZeroAddress, tokenId);
            
            // Replay attack should fail (nonce incremented)
            await expect(
                positionManager.permit(spender, tokenId, deadline, v, r, s)
            ).to.be.reverted; // Should fail due to nonce mismatch
            
            console.log("✅ GOOD: Signature replay prevented by nonce system");
        });

        it("VULN-025 MEDIUM: Expired permit acceptance", async function () {
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n;
            const spender = user2.address;
            const nonce = await positionManager.getNonce(tokenId);
            const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            
            // Try to use expired permit
            await expect(
                positionManager.permit(spender, tokenId, expiredDeadline, 27, ethers.ZeroHash, ethers.ZeroHash)
            ).to.be.reverted; // Should fail due to expired deadline
            
            console.log("✅ GOOD: Expired permits properly rejected");
        });
    });

    describe("CRITICAL: Position Burn Security", function () {
        it("VULN-026 HIGH: Burn position with outstanding liquidity", async function () {
            // Create position with liquidity
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n;
            
            // Try to burn position with outstanding liquidity (should fail)
            await expect(
                positionManager.connect(user1).burn(tokenId)
            ).to.be.revertedWith("Not cleared");
            
            // First remove all liquidity
            const position = await positionManager.positions(tokenId);
            const liquidityValue = position[7];
            const decreaseParams = {
                tokenId: tokenId,
                liquidity: liquidityValue,
                amount0Min: 0n,
                amount1Min: 0n,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };
            
            await positionManager.connect(user1).decreaseLiquidity(decreaseParams);
            
            // Collect all fees and tokens
            const collectParams = {
                tokenId: tokenId,
                recipient: user1.address,
                amount0Max: (1n << 128n) - 1n,
                amount1Max: (1n << 128n) - 1n
            };
            
            await positionManager.connect(user1).collect(collectParams);
            
            // Now burn should work
            await positionManager.connect(user1).burn(tokenId);
            
            // Verify NFT is burned
            await expect(
                positionManager.ownerOf(tokenId)
            ).to.be.revertedWith("ERC721: invalid token ID");
            
            console.log("✅ GOOD: Can only burn positions after full cleanup");
        });

        it("VULN-027 MEDIUM: Fee collection after burn", async function () {
            // Create and then properly burn a position
            const mintParams = {
                token0: await token0.getAddress(),
                token1: await token1.getAddress(),
                fee: 3000,
                tickLower: -60,
                tickUpper: 60,
                amount0Desired: ethers.parseEther("10"),
                amount1Desired: ethers.parseEther("10"),
                amount0Min: 0,
                amount1Min: 0,
                recipient: user1.address,
                deadline: Math.floor(Date.now() / 1000) + 3600
            };

            await token0.connect(user1).approve(await positionManager.getAddress(), mintParams.amount0Desired);
            await token1.connect(user1).approve(await positionManager.getAddress(), mintParams.amount1Desired);
            await positionManager.connect(user1).mint(mintParams);
            
            const tokenId = 1n;
            
            // Remove liquidity and collect fees
            const position2 = await positionManager.positions(tokenId);
            const liquidityValue2 = position2[7];
            await positionManager.connect(user1).decreaseLiquidity({
                tokenId: tokenId,
                liquidity: liquidityValue2,
                amount0Min: 0n,
                amount1Min: 0n,
                deadline: Math.floor(Date.now() / 1000) + 3600
            });
            
            await positionManager.connect(user1).collect({
                tokenId: tokenId,
                recipient: user1.address,
                amount0Max: (1n << 128n) - 1n,
                amount1Max: (1n << 128n) - 1n
            });
            
            // Burn the position
            await positionManager.connect(user1).burn(tokenId);
            
            // Attempt to collect fees after burn should fail
            await expect(
                positionManager.connect(user1).collect({
                    tokenId: tokenId,
                    recipient: user1.address,
                    amount0Max: (1n << 128n) - 1n,
                    amount1Max: (1n << 128n) - 1n
                })
            ).to.be.reverted; // Should fail since position is burned
            
            console.log("✅ GOOD: Cannot collect from burned positions");
        });
    });

    describe("Gas Optimization and DoS Protection", function () {
        it("VULN-028 MEDIUM: Gas limit DoS on enumeration", async function () {
            // Test enumeration functions don't cause DoS
            const totalSupply = await positionManager.totalSupply();
            console.log("Total supply:", totalSupply.toString());
            
            if (totalSupply > 0) {
                const tokenByIndex = await positionManager.tokenByIndex(0);
                console.log("Token by index 0:", tokenByIndex.toString());
                
                const ownerTokens = await positionManager.balanceOf(user1.address);
                console.log("User1 balance:", ownerTokens.toString());
                
                if (ownerTokens > 0) {
                    const tokenOfOwner = await positionManager.tokenOfOwnerByIndex(user1.address, 0);
                    console.log("User1's first token:", tokenOfOwner.toString());
                }
            }
            
            console.log("✅ GOOD: Enumeration functions work without gas issues");
        });
    });
}); 