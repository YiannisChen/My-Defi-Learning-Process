import { ethers } from "hardhat";

async function main() {
    console.log("Setting up initial pools...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    // Use existing factory or deploy a new one with timelock
    let factoryAddress = process.env.FACTORY_ADDRESS as string | undefined;
    if (!factoryAddress) {
        const timelockAddress = process.env.TIMELOCK_ADDRESS;
        if (!timelockAddress) throw new Error("TIMELOCK_ADDRESS not set");
        const RubySwapFactory = await ethers.getContractFactory("RubySwapFactory");
        const factory = await RubySwapFactory.deploy(timelockAddress);
        await factory.waitForDeployment();
        factoryAddress = await factory.getAddress();
        console.log("RubySwapFactory deployed to:", factoryAddress);
    }

    const factory = await ethers.getContractAt("RubySwapFactory", factoryAddress!);

    // Get OracleRegistry address
    const registryAddress = await factory.oracleRegistry();
    const OracleRegistry = await ethers.getContractAt("OracleRegistry", registryAddress);
    console.log("OracleRegistry:", registryAddress);

    // Deploy Mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const WETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await WETH.waitForDeployment();
    const wethAddress = await WETH.getAddress();

    const USDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    await USDC.waitForDeployment();
    const usdcAddress = await USDC.getAddress();

    const USDT = await MockERC20.deploy("Tether USD", "USDT", 6);
    await USDT.waitForDeployment();
    const usdtAddress = await USDT.getAddress();

    // Register Chainlink mock feeds using MockAggregatorV3
    const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
    const feedETH = await MockAggregatorV3.deploy(3000n * 10n ** 8n); // $3000
    const feedUSDC = await MockAggregatorV3.deploy(1n * 10n ** 8n);   // $1
    const feedUSDT = await MockAggregatorV3.deploy(1n * 10n ** 8n);   // $1
    await feedETH.waitForDeployment();
    await feedUSDC.waitForDeployment();
    await feedUSDT.waitForDeployment();

    await OracleRegistry.setFeed(wethAddress, await feedETH.getAddress());
    await OracleRegistry.setFeed(usdcAddress, await feedUSDC.getAddress());
    await OracleRegistry.setFeed(usdtAddress, await feedUSDT.getAddress());

    // Create pools
    await (await factory.createPool(wethAddress, usdcAddress, 3000)).wait();
    const ethUsdcPool = await factory.getPool(wethAddress, usdcAddress, 3000);

    await (await factory.createPool(wethAddress, usdtAddress, 3000)).wait();
    const ethUsdtPool = await factory.getPool(wethAddress, usdtAddress, 3000);

    await (await factory.createPool(usdcAddress, usdtAddress, 500)).wait();
    const usdcUsdtPool = await factory.getPool(usdcAddress, usdtAddress, 500);

    // Initialize pools using 1:1 as placeholder (Chainlink-ref conversion can be added later)
    const initPrice = 2n ** 96n;
    await (await ethers.getContractAt("RubySwapPool", ethUsdcPool)).initialize(initPrice);
    await (await ethers.getContractAt("RubySwapPool", ethUsdtPool)).initialize(initPrice);
    await (await ethers.getContractAt("RubySwapPool", usdcUsdtPool)).initialize(initPrice);

    // Deploy Router with correct constructor
    const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
    const router = await RubySwapRouter.deploy(factoryAddress!, wethAddress);
    await router.waitForDeployment();

    console.log("Summary:");
    console.log({
        factory: factoryAddress,
        oracleRegistry: registryAddress,
        router: await router.getAddress(),
        weth: wethAddress,
        usdc: usdcAddress,
        usdt: usdtAddress,
        ethUsdcPool,
        ethUsdtPool,
        usdcUsdtPool,
    });
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); }); 