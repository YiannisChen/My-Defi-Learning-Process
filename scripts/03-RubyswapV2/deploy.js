/*Deploying contracts with the account: 0x60F14B03929A7696Ae91468fc2206ea618F80715
Network: sepolia
Using simplified Math library for all number ranges
Deploying WETH9...
WETH9 deployed to: 0xbD5eb2A4fBE5a69700470B9913CBfA3C01Bd0A20
Deploying RubyswapV2Factory...
RubyswapV2Factory deployed to: 0x85a58B0cDdb9D30c4c611369bC3d4aa1806C6e28
Deploying RubyswapV2Router...
RubyswapV2Router deployed to: 0x840f42cB68f7bf9E1bEAc7d74fD167E60DAbf2a3
Deploying test tokens...
TokenA deployed to: 0x55DF5871ba294F5036E4822c110Ba13187f86bDb
TokenB deployed to: 0x26ca9339d4B79CE046349F2E4c7c7CD97Cf26856
Minted initial supply to deployer
Approving router to spend tokens...
Approvals complete

-- PHASE 1: Initial pool creation with micro amounts --
Creating TokenA-TokenB pool with minimal liquidity...
Setting explicit gas limit for testnet...
Successfully created TokenA-TokenB pool
Creating TokenA-WETH pool with minimal liquidity...
Setting explicit gas limit for testnet...
Successfully created TokenA-WETH pool
Creating TokenB-WETH pool with minimal liquidity...
Setting explicit gas limit for testnet...
Successfully created TokenB-WETH pool

-- PHASE 2: Adding a bit more liquidity --
Adding more liquidity to TokenA-TokenB pool...
Setting explicit gas limit for testnet...
Successfully added more liquidity to TokenA-TokenB pool
Adding more liquidity to TokenA-WETH pool...
Setting explicit gas limit for testnet...
Successfully added more liquidity to TokenA-WETH pool
Adding more liquidity to TokenB-WETH pool...
Setting explicit gas limit for testnet...
Successfully added more liquidity to TokenB-WETH pool

Deployment Summary:
WETH9: 0xbD5eb2A4fBE5a69700470B9913CBfA3C01Bd0A20
Factory: 0x85a58B0cDdb9D30c4c611369bC3d4aa1806C6e28
Router: 0x840f42cB68f7bf9E1bEAc7d74fD167E60DAbf2a3
TokenA: 0x55DF5871ba294F5036E4822c110Ba13187f86bDb
TokenB: 0x26ca9339d4B79CE046349F2E4c7c7CD97Cf26856
Pools have been created and liquidity has been added in stages
*/
const { ethers, network } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Network:", network.name);

    console.log("Using simplified Math library for all number ranges");

    // Deploy WETH9
    console.log("Deploying WETH9...");
    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.waitForDeployment();
    const wethAddress = await weth.getAddress();
    console.log("WETH9 deployed to:", wethAddress);

    // Deploy Factory
    console.log("Deploying RubyswapV2Factory...");
    const Factory = await ethers.getContractFactory("RubyswapV2Factory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    console.log("RubyswapV2Factory deployed to:", factoryAddress);

    // Deploy Router
    console.log("Deploying RubyswapV2Router...");
    const Router = await ethers.getContractFactory("RubyswapV2Router");
    const router = await Router.deploy(factoryAddress, wethAddress);
    await router.waitForDeployment();
    const routerAddress = await router.getAddress();
    console.log("RubyswapV2Router deployed to:", routerAddress);

    // Deploy test tokens
    console.log("Deploying test tokens...");
    const ERC20 = await ethers.getContractFactory(
        "contracts/03-dexV2-clone/core-contracts/test/ERC20.sol:ERC20",
    );

    // Deploy TokenA
    const tokenA = await ERC20.deploy();
    await tokenA.waitForDeployment();
    const tokenAAddress = await tokenA.getAddress();
    console.log("TokenA deployed to:", tokenAAddress);

    // Deploy TokenB
    const tokenB = await ERC20.deploy();
    await tokenB.waitForDeployment();
    const tokenBAddress = await tokenB.getAddress();
    console.log("TokenB deployed to:", tokenBAddress);

    // Mint initial supply - very small amount to avoid overflow
    const INITIAL_SUPPLY = ethers.parseEther("100"); // Just 100 tokens
    await tokenA.mint(deployer.address, INITIAL_SUPPLY);
    await tokenB.mint(deployer.address, INITIAL_SUPPLY);
    console.log("Minted initial supply to deployer");

    // Approve router to spend tokens
    console.log("Approving router to spend tokens...");
    await tokenA.approve(routerAddress, ethers.MaxUint256);
    await tokenB.approve(routerAddress, ethers.MaxUint256);
    console.log("Approvals complete");

    // Create liquidity pools - STEP 1: Begin with micro amounts for initial pool creation
    console.log("\n-- PHASE 1: Initial pool creation with micro amounts --");
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    // TokenA-TokenB pool - use extremely small amounts for first liquidity
    console.log("Creating TokenA-TokenB pool with minimal liquidity...");
    // Use micro amounts to avoid overflow
    const initialAmount = ethers.parseEther("0.001"); // Just 0.001 tokens to initialize the pool
    try {
        // Add explicit gas limit options for testnet
        const txOptions = {};
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidity(
            tokenAAddress,
            tokenBAddress,
            initialAmount,
            initialAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully created TokenA-TokenB pool");
    } catch (error) {
        console.error("Error creating TokenA-TokenB pool:", error.message);
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
        return; // Stop if we can't even create the initial pool
    }

    // TokenA-WETH pool - minimal amount
    console.log("Creating TokenA-WETH pool with minimal liquidity...");
    try {
        // Add explicit gas limit options for testnet
        const txOptions = { value: ethers.parseEther("0.00001") }; // Just 0.00001 ETH
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidityETH(
            tokenAAddress,
            initialAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully created TokenA-WETH pool");
    } catch (error) {
        console.error("Error creating TokenA-WETH pool:", error.message);
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
    }

    // TokenB-WETH pool - minimal amount
    console.log("Creating TokenB-WETH pool with minimal liquidity...");
    try {
        // Add explicit gas limit options for testnet
        const txOptions = { value: ethers.parseEther("0.00001") }; // Just 0.00001 ETH
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidityETH(
            tokenBAddress,
            initialAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully created TokenB-WETH pool");
    } catch (error) {
        console.error("Error creating TokenB-WETH pool:", error.message);
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
    }

    // STEP 2: Now that pools exist, add slightly more liquidity
    console.log("\n-- PHASE 2: Adding a bit more liquidity --");
    const moreAmount = ethers.parseEther("1"); // Just 1 token

    console.log("Adding more liquidity to TokenA-TokenB pool...");
    try {
        // Add explicit gas limit options for testnet
        const txOptions = {};
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidity(
            tokenAAddress,
            tokenBAddress,
            moreAmount,
            moreAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully added more liquidity to TokenA-TokenB pool");
    } catch (error) {
        console.error(
            "Error adding more liquidity to TokenA-TokenB pool:",
            error.message,
        );
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
    }

    console.log("Adding more liquidity to TokenA-WETH pool...");
    try {
        // Add explicit gas limit options for testnet
        const txOptions = { value: ethers.parseEther("0.001") }; // 0.001 ETH
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidityETH(
            tokenAAddress,
            moreAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully added more liquidity to TokenA-WETH pool");
    } catch (error) {
        console.error(
            "Error adding more liquidity to TokenA-WETH pool:",
            error.message,
        );
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
    }

    console.log("Adding more liquidity to TokenB-WETH pool...");
    try {
        // Add explicit gas limit options for testnet
        const txOptions = { value: ethers.parseEther("0.001") }; // 0.001 ETH
        if (network.name === "sepolia" || network.name === "goerli") {
            console.log("Setting explicit gas limit for testnet...");
            txOptions.gasLimit = 3000000; // 3 million gas should be sufficient
        }

        await router.addLiquidityETH(
            tokenBAddress,
            moreAmount,
            0,
            0,
            deployer.address,
            deadline,
            txOptions,
        );
        console.log("Successfully added more liquidity to TokenB-WETH pool");
    } catch (error) {
        console.error(
            "Error adding more liquidity to TokenB-WETH pool:",
            error.message,
        );
        // Log full error for debugging on testnets
        if (network.name !== "hardhat" && network.name !== "localhost") {
            console.error("Full error:", error);
        }
    }

    console.log("\nDeployment Summary:");
    console.log("WETH9:", wethAddress);
    console.log("Factory:", factoryAddress);
    console.log("Router:", routerAddress);
    console.log("TokenA:", tokenAAddress);
    console.log("TokenB:", tokenBAddress);
    console.log(
        "Pools have been created and liquidity has been added in stages",
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
