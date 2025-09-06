// test/RubyswapV2Router.spec.js

const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { parseEther } = ethers;

describe("RubyswapV2Router", function () {
    let owner, addr1, addr2;
    let TokenA, tokenA, TokenB, tokenB;
    let WETH, weth;
    let Factory, factory;
    let Router, router;

    const INITIAL_SUPPLY = parseEther("1000000"); // 1 Million tokens
    const DEADLINE_OFFSET = 60 * 20; // 20 minutes from current block timestamp

    // Helper function to get a deadline timestamp
    async function getDeadline() {
        const block = await ethers.provider.getBlock("latest");
        if (!block) throw new Error("Failed to get latest block");
        return block.timestamp + DEADLINE_OFFSET;
    }

    beforeEach(async function () {
        // Get signers
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy Mock ERC20 Tokens
        // Assuming you have a basic ERC20 contract artifact available, possibly from OpenZeppelin or your own test ERC20.
        // Adjust the path/name if necessary based on your ERC20.sol file location
        const ERC20MockFactory = await ethers.getContractFactory(
            "contracts/03-dexV2-clone/core-contracts/test/ERC20.sol:ERC20",
            owner,
        );
        tokenA = await ERC20MockFactory.deploy();
        tokenB = await ERC20MockFactory.deploy();

        // Mint initial supply after deployment
        await tokenA.mint(owner.address, INITIAL_SUPPLY);
        await tokenB.mint(owner.address, INITIAL_SUPPLY);

        // Deploy WETH9 (assuming WETH9.sol is in periphery)
        const WETH9Factory = await ethers.getContractFactory("WETH9", owner);
        weth = await WETH9Factory.deploy();
        // await weth.waitForDeployment();

        // Deploy Factory
        const FactoryFactory = await ethers.getContractFactory(
            "RubyswapV2Factory",
            owner,
        );
        factory = await FactoryFactory.deploy();
        // await factory.waitForDeployment();

        // Deploy Router
        const RouterFactory = await ethers.getContractFactory(
            "RubyswapV2Router",
            owner,
        );
        router = await RouterFactory.deploy(
            await factory.getAddress(),
            await weth.getAddress(),
        );
        // await router.waitForDeployment();

        // --- Approvals ---
        // Owner approves router to spend their tokens
        await tokenA
            .connect(owner)
            .approve(await router.getAddress(), ethers.MaxUint256);
        await tokenB
            .connect(owner)
            .approve(await router.getAddress(), ethers.MaxUint256);

        // Send some tokens to addr1 for testing swaps and have addr1 approve router
        await tokenA
            .connect(owner)
            .transfer(addr1.address, parseEther("10000"));
        await tokenB
            .connect(owner)
            .transfer(addr1.address, parseEther("10000"));
        await tokenA
            .connect(addr1)
            .approve(await router.getAddress(), ethers.MaxUint256);
        await tokenB
            .connect(addr1)
            .approve(await router.getAddress(), ethers.MaxUint256);
    });

    describe("Deployment", function () {
        it("Should set the correct factory address", async function () {
            expect(await router.factory()).to.equal(await factory.getAddress());
        });

        it("Should set the correct WETH address", async function () {
            expect(await router.WETH()).to.equal(await weth.getAddress());
        });
    });

    describe("addLiquidity", function () {
        const amountADesired = parseEther("1000");
        const amountBDesired = parseEther("1000");
        const amountAMin = parseEther("900"); // Allow some slippage
        const amountBMin = parseEther("900");

        it("Should add liquidity for the first time and create pair", async function () {
            const deadline = await getDeadline();
            const tokenAAddr = await tokenA.getAddress();
            const tokenBAddr = await tokenB.getAddress();

            // Check pair doesn't exist yet
            expect(await factory.getPair(tokenAAddr, tokenBAddr)).to.equal(
                ethers.ZeroAddress,
            );

            const initialOwnerBalanceA = await tokenA.balanceOf(owner.address);
            const initialOwnerBalanceB = await tokenB.balanceOf(owner.address);

            // Add liquidity
            await expect(
                router.connect(owner).addLiquidity(
                    tokenAAddr,
                    tokenBAddr,
                    amountADesired,
                    amountBDesired,
                    amountAMin, // Min amounts less important for first liquidity
                    amountBMin,
                    owner.address,
                    deadline,
                ),
            ).to.emit(factory, "PairCreated"); // Check factory emits PairCreated

            const pairAddress = await factory.getPair(tokenAAddr, tokenBAddr);
            expect(pairAddress).to.not.equal(ethers.ZeroAddress);

            // Check balances transferred
            expect(await tokenA.balanceOf(owner.address)).to.equal(
                initialOwnerBalanceA - amountADesired,
            );
            expect(await tokenB.balanceOf(owner.address)).to.equal(
                initialOwnerBalanceB - amountBDesired,
            );
            expect(await tokenA.balanceOf(pairAddress)).to.equal(
                amountADesired,
            );
            expect(await tokenB.balanceOf(pairAddress)).to.equal(
                amountBDesired,
            );

            // Check LP tokens minted to 'to' address (owner)
            const Pair = await ethers.getContractFactory("RubyswapV2Pair"); // Need Pair ABI
            const pair = Pair.attach(pairAddress);
            const lpBalance = await pair.balanceOf(owner.address);
            expect(lpBalance).to.be.gt(0); // Should receive some LP tokens
            // console.log("LP balance:", formatEther(lpBalance)); // Optional logging
        });

        it("Should add liquidity respecting optimal amounts when pool exists", async function () {
            const deadline = await getDeadline();
            const tokenAAddr = await tokenA.getAddress();
            const tokenBAddr = await tokenB.getAddress();

            // Initial liquidity (1000 A / 1000 B)
            await router
                .connect(owner)
                .addLiquidity(
                    tokenAAddr,
                    tokenBAddr,
                    parseEther("1000"),
                    parseEther("1000"),
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                );

            const pairAddress = await factory.getPair(tokenAAddr, tokenBAddr);
            const Pair = await ethers.getContractFactory("RubyswapV2Pair");
            const pair = Pair.attach(pairAddress);
            const initialLpBalance = await pair.balanceOf(owner.address);
            const initialPairBalanceA = await tokenA.balanceOf(pairAddress);
            const initialPairBalanceB = await tokenB.balanceOf(pairAddress);

            // Add more liquidity (want 200 A, 300 B - B is excessive)
            const amountAToAdd = parseEther("200");
            const amountBToAddDesired = parseEther("300");
            const amountBToAddMin = parseEther("190"); // Min B required based on 200 A
            const amountAToAddMin = parseEther("190"); // Min A required

            await router
                .connect(owner)
                .addLiquidity(
                    tokenAAddr,
                    tokenBAddr,
                    amountAToAdd,
                    amountBToAddDesired,
                    amountAToAddMin,
                    amountBToAddMin,
                    owner.address,
                    deadline,
                );

            // Optimal B should be 200 (since ratio is 1:1 and we add 200 A)
            const expectedBAdded = parseEther("200");

            // Check pair balances increased correctly
            expect(await tokenA.balanceOf(pairAddress)).to.equal(
                initialPairBalanceA + amountAToAdd,
            );
            expect(await tokenB.balanceOf(pairAddress)).to.equal(
                initialPairBalanceB + expectedBAdded,
            );

            // Check LP tokens increased
            expect(await pair.balanceOf(owner.address)).to.be.gt(
                initialLpBalance,
            );
        });

        it("Should fail if deadline expired", async function () {
            const expiredDeadline =
                (await ethers.provider.getBlock("latest")).timestamp - 1;
            await expect(
                router
                    .connect(owner)
                    .addLiquidity(
                        await tokenA.getAddress(),
                        await tokenB.getAddress(),
                        amountADesired,
                        amountBDesired,
                        amountAMin,
                        amountBMin,
                        owner.address,
                        expiredDeadline,
                    ),
            ).to.be.revertedWith("RubyswapV2Router: EXPIRED");
        });

        it("Should fail with INSUFFICIENT_B_AMOUNT", async function () {
            const deadline = await getDeadline();
            // Add initial liquidity to set ratio 1:1
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    parseEther("1000"),
                    parseEther("1000"),
                    0,
                    0,
                    owner.address,
                    deadline,
                );
            // Try to add 200 A, 150 B (desired). Optimal B is 200.
            // Set min B required to 180 (higher than desired B, lower than optimal B) -> This should calculate optimal B (200) and then fail because 200 < 180 (min) is false.
            // Ah wait, the check is `amountBOptimal >= amountBMin`. Here optimalB = 200, amountBDesired = 150. It enters the first branch (amountBOptimal > amountBDesired). amountAOptimal = 150. amountAMin = 100. Check amountAOptimal >= amountAMin (150>=100) -> OK. Uses (150 A, 150 B).

            // Let's try: add 200 A, 250 B (desired). Optimal B is 200.
            // Set min B required to 210.
            // It enters the first branch (amountBOptimal <= amountBDesired, 200 <= 250).
            // Check: amountBOptimal >= amountBMin (200 >= 210) -> False. Reverts.
            await expect(
                router.connect(owner).addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    parseEther("200"),
                    parseEther("250"), // Desire 200 A, 250 B
                    parseEther("190"), // amountAMin
                    parseEther("210"), // amountBMin > optimal B (200)
                    owner.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("RubyswapV2Router: INSUFFICIENT_B_AMOUNT");
        });

        it("Should fail with INSUFFICIENT_A_AMOUNT", async function () {
            const deadline = await getDeadline();
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    parseEther("1000"),
                    parseEther("1000"),
                    0,
                    0,
                    owner.address,
                    deadline,
                );
            // Try to add 250 A (desired), 200 B (desired). Optimal A is 200.
            // Set min A required to 210.
            // It enters the second branch (amountBOptimal > amountBDesired -> amountAOptimal path).
            // Optimal A is 200 based on 200 B.
            // Check: amountAOptimal >= amountAMin (200 >= 210) -> False. Reverts.
            await expect(
                router.connect(owner).addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    parseEther("250"),
                    parseEther("200"), // Desire 250 A, 200 B
                    parseEther("210"), // amountAMin > optimal A (200)
                    parseEther("190"), // amountBMin
                    owner.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("RubyswapV2Router: INSUFFICIENT_A_AMOUNT");
        });
    });

    describe("addLiquidityETH", function () {
        const amountTokenDesired = parseEther("1000");
        const amountETHDesired = parseEther("10"); // 10 ETH
        const amountTokenMin = parseEther("900");
        const amountETHMin = parseEther("9"); // 9 ETH

        it("Should add liquidity for ETH and Token", async function () {
            const deadline = await getDeadline();
            const tokenAddr = await tokenA.getAddress();
            const wethAddr = await weth.getAddress();

            const initialOwnerBalanceToken = await tokenA.balanceOf(
                owner.address,
            );
            const initialOwnerBalanceETH = await ethers.provider.getBalance(
                owner.address,
            );

            const tx = await router.connect(owner).addLiquidityETH(
                tokenAddr,
                amountTokenDesired,
                amountTokenMin,
                amountETHMin,
                owner.address,
                deadline,
                { value: amountETHDesired }, // Send ETH with the transaction
            );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice; // ethers v6

            const pairAddress = await factory.getPair(tokenAddr, wethAddr);
            expect(pairAddress).to.not.equal(ethers.ZeroAddress);

            // Check balances transferred
            expect(await tokenA.balanceOf(owner.address)).to.equal(
                initialOwnerBalanceToken - amountTokenDesired,
            );
            expect(await ethers.provider.getBalance(owner.address)).to.equal(
                initialOwnerBalanceETH - amountETHDesired - gasUsed,
            ); // Check ETH decrease
            expect(await tokenA.balanceOf(pairAddress)).to.equal(
                amountTokenDesired,
            );
            expect(await weth.balanceOf(pairAddress)).to.equal(
                amountETHDesired,
            ); // Check WETH balance in pair

            // Check LP tokens minted
            const Pair = await ethers.getContractFactory("RubyswapV2Pair");
            const pair = Pair.attach(pairAddress);
            expect(await pair.balanceOf(owner.address)).to.be.gt(0);
        });

        it("Should refund excess ETH if msg.value is greater than required", async function () {
            const deadline = await getDeadline();
            const tokenAddr = await tokenA.getAddress();

            // Add initial liquidity (1000 TokenA / 10 ETH)
            await router
                .connect(owner)
                .addLiquidityETH(
                    tokenAddr,
                    parseEther("1000"),
                    0,
                    0,
                    owner.address,
                    deadline,
                    { value: parseEther("10") },
                );

            const initialOwnerBalanceETH = await ethers.provider.getBalance(
                owner.address,
            );

            // Add more liquidity: desire 100 TokenA, send 2 ETH (optimal ETH is 1)
            const amountTokenToAdd = parseEther("100");
            const amountETHToSend = parseEther("2");
            const amountETHMin = parseEther("0.9"); // Min required ETH based on token amount
            const amountTokenMin = parseEther("90");

            const tx = await router
                .connect(owner)
                .addLiquidityETH(
                    tokenAddr,
                    amountTokenToAdd,
                    amountTokenMin,
                    amountETHMin,
                    owner.address,
                    await getDeadline(),
                    { value: amountETHToSend },
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const expectedETHAdded = parseEther("1"); // Since ratio is 100:1, 100 TokenA needs 1 ETH
            const expectedRefund = amountETHToSend - expectedETHAdded; // Should get 1 ETH back

            // Check owner's ETH balance reflects the cost and refund
            expect(await ethers.provider.getBalance(owner.address)).to.equal(
                initialOwnerBalanceETH - expectedETHAdded - gasUsed, // Net cost is 1 ETH + gas
            );
        });

        // Add tests for deadline and insufficient amounts similar to addLiquidity
    });

    describe("removeLiquidity", function () {
        const initialAmountA = parseEther("2000");
        const initialAmountB = parseEther("2000");
        let pairAddress;
        let pair;
        let initialLpBalance;

        beforeEach(async function () {
            // Add initial liquidity
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    initialAmountA,
                    initialAmountB,
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                );
            pairAddress = await factory.getPair(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
            );
            const PairFactory =
                await ethers.getContractFactory("RubyswapV2Pair");
            pair = PairFactory.attach(pairAddress);
            initialLpBalance = await pair.balanceOf(owner.address);
            expect(initialLpBalance).to.be.gt(0);

            // Owner needs to approve router to spend LP tokens
            await pair
                .connect(owner)
                .approve(await router.getAddress(), ethers.MaxUint256);
        });

        it("Should remove liquidity and return tokens", async function () {
            const liquidityToRemove = initialLpBalance / 2n; // Remove 50%
            const amountAMin = ((initialAmountA / 2n) * 99n) / 100n; // Expect ~50% back, allow 1% slippage
            const amountBMin = ((initialAmountB / 2n) * 99n) / 100n;

            const initialOwnerBalanceA = await tokenA.balanceOf(owner.address);
            const initialOwnerBalanceB = await tokenB.balanceOf(owner.address);
            const initialPairBalanceA = await tokenA.balanceOf(pairAddress);
            const initialPairBalanceB = await tokenB.balanceOf(pairAddress);

            await expect(
                router
                    .connect(owner)
                    .removeLiquidity(
                        await tokenA.getAddress(),
                        await tokenB.getAddress(),
                        liquidityToRemove,
                        amountAMin,
                        amountBMin,
                        owner.address,
                        await getDeadline(),
                    ),
            ).to.emit(pair, "Burn"); // Check for Burn event

            // Check LP balance decreased
            expect(await pair.balanceOf(owner.address)).to.equal(
                initialLpBalance - liquidityToRemove,
            );

            // Check owner received tokens (should be approx 50% of pair's initial)
            const receivedA =
                (await tokenA.balanceOf(owner.address)) - initialOwnerBalanceA;
            const receivedB =
                (await tokenB.balanceOf(owner.address)) - initialOwnerBalanceB;
            expect(receivedA).to.be.gte(amountAMin);
            expect(receivedB).to.be.gte(amountBMin);
            // More precise check (expect roughly half)
            expect(receivedA).to.be.closeTo(
                initialPairBalanceA / 2n,
                parseEther("0.01"),
            );
            expect(receivedB).to.be.closeTo(
                initialPairBalanceB / 2n,
                parseEther("0.01"),
            );

            // Check pair balances decreased
            expect(await tokenA.balanceOf(pairAddress)).to.be.closeTo(
                initialPairBalanceA / 2n,
                parseEther("0.01"),
            );
            expect(await tokenB.balanceOf(pairAddress)).to.be.closeTo(
                initialPairBalanceB / 2n,
                parseEther("0.01"),
            );
        });

        it("Should fail if deadline expired", async function () {
            const liquidityToRemove = initialLpBalance / 2n;
            const expiredDeadline =
                (await ethers.provider.getBlock("latest")).timestamp - 1;
            await expect(
                router
                    .connect(owner)
                    .removeLiquidity(
                        await tokenA.getAddress(),
                        await tokenB.getAddress(),
                        liquidityToRemove,
                        0,
                        0,
                        owner.address,
                        expiredDeadline,
                    ),
            ).to.be.revertedWith("RubyswapV2Router: EXPIRED");
        });

        it("Should fail with INSUFFICIENT_A_AMOUNT", async function () {
            const liquidityToRemove = initialLpBalance; // Remove all
            const expectedAmountA = initialAmountA; // Expect roughly initial amount back
            const amountAMinTooHigh = expectedAmountA + 1n; // Set min higher than possible

            await expect(
                router.connect(owner).removeLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    liquidityToRemove,
                    amountAMinTooHigh,
                    0, // amountBMin is 0
                    owner.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("RubyswapV2Router: INSUFFICIENT_A_AMOUNT");
        });

        it("Should fail with INSUFFICIENT_B_AMOUNT", async function () {
            const liquidityToRemove = initialLpBalance;
            const expectedAmountB = initialAmountB;
            const amountBMinTooHigh = expectedAmountB + 1n;

            await expect(
                router.connect(owner).removeLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    liquidityToRemove,
                    0,
                    amountBMinTooHigh, // amountAMin is 0
                    owner.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("RubyswapV2Router: INSUFFICIENT_B_AMOUNT");
        });
    });

    describe("removeLiquidityETH", function () {
        const initialAmountToken = parseEther("1000");
        const initialAmountETH = parseEther("10");
        let pairAddress;
        let pair;
        let initialLpBalance;

        beforeEach(async function () {
            // Add initial ETH liquidity
            await router
                .connect(owner)
                .addLiquidityETH(
                    await tokenA.getAddress(),
                    initialAmountToken,
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                    { value: initialAmountETH },
                );
            pairAddress = await factory.getPair(
                await tokenA.getAddress(),
                await weth.getAddress(),
            );
            const PairFactory =
                await ethers.getContractFactory("RubyswapV2Pair");
            pair = PairFactory.attach(pairAddress);
            initialLpBalance = await pair.balanceOf(owner.address);
            expect(initialLpBalance).to.be.gt(0);
            await pair
                .connect(owner)
                .approve(await router.getAddress(), ethers.MaxUint256);
        });

        it("Should remove liquidity and return ETH and Token", async function () {
            const liquidityToRemove = initialLpBalance / 2n; // Remove 50%
            const amountTokenMin = ((initialAmountToken / 2n) * 99n) / 100n; // Expect ~50% back, 1% slippage
            const amountETHMin = ((initialAmountETH / 2n) * 99n) / 100n;

            const initialOwnerBalanceToken = await tokenA.balanceOf(
                owner.address,
            );
            const initialOwnerBalanceETH = await ethers.provider.getBalance(
                owner.address,
            );

            const tx = await router
                .connect(owner)
                .removeLiquidityETH(
                    await tokenA.getAddress(),
                    liquidityToRemove,
                    amountTokenMin,
                    amountETHMin,
                    owner.address,
                    await getDeadline(),
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // Check LP balance decreased
            expect(await pair.balanceOf(owner.address)).to.equal(
                initialLpBalance - liquidityToRemove,
            );

            // Check owner received token
            const receivedToken =
                (await tokenA.balanceOf(owner.address)) -
                initialOwnerBalanceToken;
            expect(receivedToken).to.be.gte(amountTokenMin);
            expect(receivedToken).to.be.closeTo(
                initialAmountToken / 2n,
                parseEther("0.01"),
            );

            // Check owner received ETH
            const receivedETH =
                (await ethers.provider.getBalance(owner.address)) -
                (initialOwnerBalanceETH - gasUsed);
            expect(receivedETH).to.be.gte(amountETHMin);
            expect(receivedETH).to.be.closeTo(
                initialAmountETH / 2n,
                parseEther("0.01"),
            ); // Check ETH received is close to expected

            // Check pair balances decreased (TokenA and WETH)
            expect(await tokenA.balanceOf(pairAddress)).to.be.closeTo(
                initialAmountToken / 2n,
                parseEther("0.01"),
            );
            expect(await weth.balanceOf(pairAddress)).to.be.closeTo(
                initialAmountETH / 2n,
                parseEther("0.01"),
            );
        });

        // Add tests for deadline and insufficient amounts similar to removeLiquidity
    });

    // ======================================================================
    // ============================ SWAP TESTS ============================
    // ======================================================================

    describe("Swaps", function () {
        const swapAmount = parseEther("100"); // Amount to swap

        beforeEach(async function () {
            // Provide ample liquidity for stable prices during basic swap tests
            // Pair A/B: 10,000 A / 10,000 B
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    parseEther("10000"),
                    parseEther("10000"),
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                );
            // Pair A/WETH: 10,000 A / 100 ETH
            await router
                .connect(owner)
                .addLiquidityETH(
                    await tokenA.getAddress(),
                    parseEther("10000"),
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                    { value: parseEther("100") },
                );
            // Pair B/WETH: 10,000 B / 100 ETH
            await router.connect(owner).addLiquidityETH(
                await tokenB.getAddress(), // Need to add liquidity for TokenB/WETH pair too
                parseEther("10000"),
                0,
                0,
                owner.address,
                await getDeadline(),
                { value: parseEther("100") },
            );

            // Ensure addr1 has tokens (done in outer beforeEach) and ETH (default)
        });

        // --- swapExactTokensForTokens ---
        it("swapExactTokensForTokens: Should swap TokenA for TokenB", async function () {
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsOut(swapAmount, path);
            const amountOutMin = (amounts[1] * 99n) / 100n; // 1% slippage

            const initialAddr1BalanceA = await tokenA.balanceOf(addr1.address);
            const initialAddr1BalanceB = await tokenB.balanceOf(addr1.address);
            const pairAddress = await factory.getPair(path[0], path[1]);

            await expect(
                router
                    .connect(addr1)
                    .swapExactTokensForTokens(
                        swapAmount,
                        amountOutMin,
                        path,
                        addr1.address,
                        await getDeadline(),
                    ),
            )
                .to.emit(tokenB, "Transfer") // Check TokenB was transferred *to* addr1
                .withArgs(
                    pairAddress,
                    addr1.address,
                    (value) => value >= amountOutMin,
                ); // Check value

            expect(await tokenA.balanceOf(addr1.address)).to.equal(
                initialAddr1BalanceA - swapAmount,
            );
            expect(await tokenB.balanceOf(addr1.address)).to.be.gte(
                initialAddr1BalanceB + amountOutMin,
            );
        });

        it("swapExactTokensForTokens: Should fail with INSUFFICIENT_OUTPUT_AMOUNT", async function () {
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsOut(swapAmount, path);
            const amountOutMinTooHigh = amounts[1] + 1n; // Set min higher than achievable

            await expect(
                router
                    .connect(addr1)
                    .swapExactTokensForTokens(
                        swapAmount,
                        amountOutMinTooHigh,
                        path,
                        addr1.address,
                        await getDeadline(),
                    ),
            ).to.be.revertedWith(
                "RubyswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT",
            );
        });

        // --- swapTokensForExactTokens ---
        it("swapTokensForExactTokens: Should swap TokenA for exact TokenB", async function () {
            const amountOut = parseEther("100"); // Want exactly 100 TokenB
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsIn(amountOut, path);
            const amountInMax = (amounts[0] * 101n) / 100n; // Allow paying max 1% extra TokenA

            const initialAddr1BalanceA = await tokenA.balanceOf(addr1.address);
            const initialAddr1BalanceB = await tokenB.balanceOf(addr1.address);
            const pairAddress = await factory.getPair(path[0], path[1]);

            await expect(
                router
                    .connect(addr1)
                    .swapTokensForExactTokens(
                        amountOut,
                        amountInMax,
                        path,
                        addr1.address,
                        await getDeadline(),
                    ),
            )
                .to.emit(tokenA, "Transfer") // Check TokenA was transferred *from* addr1
                .withArgs(
                    addr1.address,
                    pairAddress,
                    (value) => value <= amountInMax && value > 0,
                );

            expect(await tokenB.balanceOf(addr1.address)).to.equal(
                initialAddr1BalanceB + amountOut,
            ); // Got exact amount
            expect(await tokenA.balanceOf(addr1.address)).to.be.lte(
                initialAddr1BalanceA - amounts[0],
            ); // Paid no more than calculated needed amount
        });

        it("swapTokensForExactTokens: Should fail with EXCESSIVE_INPUT_AMOUNT", async function () {
            const amountOut = parseEther("100");
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsIn(amountOut, path);
            const amountInMaxTooLow = amounts[0] - 1n; // Set max lower than required

            await expect(
                router
                    .connect(addr1)
                    .swapTokensForExactTokens(
                        amountOut,
                        amountInMaxTooLow,
                        path,
                        addr1.address,
                        await getDeadline(),
                    ),
            ).to.be.revertedWith("RubyswapV2Router: EXCESSIVE_INPUT_AMOUNT");
        });

        // --- swapExactETHForTokens ---
        it("swapExactETHForTokens: Should swap ETH for TokenA", async function () {
            const amountETHIn = parseEther("1"); // Swap 1 ETH
            const path = [await weth.getAddress(), await tokenA.getAddress()];
            const amounts = await router.getAmountsOut(amountETHIn, path);
            const amountOutMin = (amounts[1] * 99n) / 100n; // 1% slippage

            const initialAddr1BalanceToken = await tokenA.balanceOf(
                addr1.address,
            );
            const initialAddr1BalanceETH = await ethers.provider.getBalance(
                addr1.address,
            );

            const tx = await router
                .connect(addr1)
                .swapExactETHForTokens(
                    amountOutMin,
                    path,
                    addr1.address,
                    await getDeadline(),
                    { value: amountETHIn },
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            expect(await tokenA.balanceOf(addr1.address)).to.be.gte(
                initialAddr1BalanceToken + amountOutMin,
            );
            expect(await ethers.provider.getBalance(addr1.address)).to.equal(
                initialAddr1BalanceETH - amountETHIn - gasUsed,
            );
        });

        // --- swapTokensForExactETH ---
        it("swapTokensForExactETH: Should swap TokenA for exact ETH", async function () {
            const amountETHOut = parseEther("1"); // Want exactly 1 ETH
            const path = [await tokenA.getAddress(), await weth.getAddress()];
            const amounts = await router.getAmountsIn(amountETHOut, path);
            const amountInMax = (amounts[0] * 101n) / 100n; // Max 1% extra TokenA

            const initialAddr1BalanceToken = await tokenA.balanceOf(
                addr1.address,
            );
            const initialAddr1BalanceETH = await ethers.provider.getBalance(
                addr1.address,
            );

            const tx = await router
                .connect(addr1)
                .swapTokensForExactETH(
                    amountETHOut,
                    amountInMax,
                    path,
                    addr1.address,
                    await getDeadline(),
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(addr1.address)).to.equal(
                initialAddr1BalanceETH + amountETHOut - gasUsed,
            );
            expect(await tokenA.balanceOf(addr1.address)).to.be.lte(
                initialAddr1BalanceToken - amounts[0],
            ); // Paid no more than needed
        });

        // --- swapExactTokensForETH ---
        it("swapExactTokensForETH: Should swap TokenA for ETH", async function () {
            const amountTokenIn = parseEther("100");
            const path = [await tokenA.getAddress(), await weth.getAddress()];
            const amounts = await router.getAmountsOut(amountTokenIn, path);
            const amountOutMin = (amounts[1] * 99n) / 100n; // Min 1% slippage

            const initialAddr1BalanceToken = await tokenA.balanceOf(
                addr1.address,
            );
            const initialAddr1BalanceETH = await ethers.provider.getBalance(
                addr1.address,
            );

            const tx = await router
                .connect(addr1)
                .swapExactTokensForETH(
                    amountTokenIn,
                    amountOutMin,
                    path,
                    addr1.address,
                    await getDeadline(),
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            expect(await tokenA.balanceOf(addr1.address)).to.equal(
                initialAddr1BalanceToken - amountTokenIn,
            );
            expect(await ethers.provider.getBalance(addr1.address)).to.be.gte(
                initialAddr1BalanceETH + amountOutMin - gasUsed,
            );
        });

        // --- swapETHForExactTokens ---
        it("swapETHForExactTokens: Should swap ETH for exact TokenA", async function () {
            const amountTokenOut = parseEther("100"); // Want exactly 100 TokenA
            const path = [await weth.getAddress(), await tokenA.getAddress()];
            const amounts = await router.getAmountsIn(amountTokenOut, path);
            const requiredETHIn = amounts[0];
            const amountETHToSend = (requiredETHIn * 101n) / 100n; // Send max 1% extra ETH

            const initialAddr1BalanceToken = await tokenA.balanceOf(
                addr1.address,
            );
            const initialAddr1BalanceETH = await ethers.provider.getBalance(
                addr1.address,
            );

            const tx = await router
                .connect(addr1)
                .swapETHForExactTokens(
                    amountTokenOut,
                    path,
                    addr1.address,
                    await getDeadline(),
                    { value: amountETHToSend },
                );
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            expect(await tokenA.balanceOf(addr1.address)).to.equal(
                initialAddr1BalanceToken + amountTokenOut,
            );
            // Check ETH spent + gas <= ETH sent
            expect(await ethers.provider.getBalance(addr1.address)).to.be.gte(
                initialAddr1BalanceETH - amountETHToSend - gasUsed,
            );
            // More precise: check ETH balance reflects required input + gas + refund
            expect(await ethers.provider.getBalance(addr1.address)).to.equal(
                initialAddr1BalanceETH - requiredETHIn - gasUsed,
            );
        });

        it("swapETHForExactTokens: Should fail with EXCESSIVE_INPUT_AMOUNT (msg.value too low)", async function () {
            const amountTokenOut = parseEther("100");
            const path = [await weth.getAddress(), await tokenA.getAddress()];
            const amounts = await router.getAmountsIn(amountTokenOut, path);
            const requiredETHIn = amounts[0];
            const amountETHToSend = requiredETHIn - 1n; // Send less than needed

            await expect(
                router
                    .connect(addr1)
                    .swapETHForExactTokens(
                        amountTokenOut,
                        path,
                        addr1.address,
                        await getDeadline(),
                        { value: amountETHToSend },
                    ),
            ).to.be.revertedWith("RubyswapV2Router: EXCESSIVE_INPUT_AMOUNT"); // Fails require(amounts[0] <= msg.value)
        });

        // Add deadline failure tests for swap functions as well...
        it("swapExactTokensForTokens: Should fail if deadline expired", async function () {
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const expiredDeadline =
                (await ethers.provider.getBlock("latest")).timestamp - 1;
            await expect(
                router
                    .connect(addr1)
                    .swapExactTokensForTokens(
                        parseEther("1"),
                        0,
                        path,
                        addr1.address,
                        expiredDeadline,
                    ),
            ).to.be.revertedWith("RubyswapV2Router: EXPIRED");
        });
    });

    describe("Library Functions Exposure", function () {
        const amountA = parseEther("100");
        const reserveA = parseEther("1000");
        const reserveB = parseEther("2000"); // 1:2 ratio

        it("quote: Should calculate quoted amount correctly", async function () {
            // amountB = amountA * reserveB / reserveA = 100 * 2000 / 1000 = 200
            const expectedAmountB = parseEther("200");
            expect(await router.quote(amountA, reserveA, reserveB)).to.equal(
                expectedAmountB,
            );
        });

        it("getAmountOut: Should calculate amount out correctly", async function () {
            const amountIn = parseEther("50");
            // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
            // = (50 * 997 * 2000) / (1000 * 1000 + 50 * 997)
            const amountInWithFee = amountIn * 997n;
            const numerator = amountInWithFee * reserveB;
            const denominator = reserveA * 1000n + amountInWithFee;
            const expectedAmountOut = numerator / denominator;
            expect(
                await router.getAmountOut(amountIn, reserveA, reserveB),
            ).to.equal(expectedAmountOut);
        });

        it("getAmountIn: Should calculate amount in correctly", async function () {
            const amountOut = parseEther("100");
            // amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
            // = (1000 * 100 * 1000) / ((2000 - 100) * 997) + 1
            const numerator = reserveA * amountOut * 1000n;
            const denominator = (reserveB - amountOut) * 997n;
            const expectedAmountIn = numerator / denominator + 1n;
            expect(
                await router.getAmountIn(amountOut, reserveA, reserveB),
            ).to.equal(expectedAmountIn);
        });

        it("getAmountsOut: Should return correct amounts for path", async function () {
            // Requires liquidity to be added first for view function to work
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    reserveA,
                    reserveB,
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                );

            const amountIn = parseEther("50");
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsOut(amountIn, path);

            expect(amounts.length).to.equal(2);
            expect(amounts[0]).to.equal(amountIn);
            // Get actual reserves for comparison
            const pairAddr = await factory.getPair(path[0], path[1]);
            const Pair = await ethers.getContractFactory("RubyswapV2Pair");
            const pair = Pair.attach(pairAddr);
            const [resA, resB] = await pair.getReserves();
            const expectedOut = await router.getAmountOut(amountIn, resA, resB);
            expect(amounts[1]).to.equal(expectedOut);
        });

        it("getAmountsIn: Should return correct amounts for path", async function () {
            await router
                .connect(owner)
                .addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    reserveA,
                    reserveB,
                    0,
                    0,
                    owner.address,
                    await getDeadline(),
                );

            const amountOut = parseEther("100");
            const path = [await tokenA.getAddress(), await tokenB.getAddress()];
            const amounts = await router.getAmountsIn(amountOut, path);

            expect(amounts.length).to.equal(2);
            expect(amounts[1]).to.equal(amountOut);

            // Calculate expected input using test reserves
            const numerator = reserveA * amountOut * 1000n;
            const denominator = (reserveB - amountOut) * 997n;
            const expectedIn = numerator / denominator + 1n;

            expect(amounts[0]).to.equal(expectedIn);
        });
    });
});
