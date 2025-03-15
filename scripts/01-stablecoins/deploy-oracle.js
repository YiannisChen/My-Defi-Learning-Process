// scripts/01-stablecoins/deploy-oracle.js
const { ethers } = require("hardhat");

const CONFIG = {
  initialEthPrice: ethers.parseUnits("2000.0", 18), // $2000.0 with 18 decimals
  waitConfirmations: 5
};

async function main() {
  try {
    // Get the deployer's address
    const [deployer] = await ethers.getSigners();
    console.log("\n=== SimplePriceOracle Deployment ===");
    console.log("Network:", network.name);
    console.log("Deploying with account:", deployer.address);
    
    // Check balance 
    const balanceBefore = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer balance before: ${ethers.formatEther(balanceBefore)} ETH`);
    
    // Deploy contract 
    console.log("\nDeploying SimplePriceOracle...");
    const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
    const simplePriceOracle = await SimplePriceOracle.deploy(
      deployer.address,
      CONFIG.initialEthPrice
    );
    
    // Wait for deployment 
    console.log("Waiting for transaction confirmation...");
    await simplePriceOracle.waitForDeployment();
    
    // Get contract address
    const contractAddress = await simplePriceOracle.getAddress();
    console.log(`\nSimplePriceOracle deployed successfully! ✅`);
    console.log(`Contract address: ${contractAddress}`);
    
    // gas 
    const balanceAfter = await ethers.provider.getBalance(deployer.address);
    console.log(`\nDeployer balance after: ${ethers.formatEther(balanceAfter)} ETH`);
    console.log(`Gas used: ${ethers.formatEther(balanceBefore - balanceAfter)} ETH`);
    
    // Verify oracle details
    console.log("\n=== Oracle Details ===");
    const ethPrice = await simplePriceOracle.getEthPrice();
    const lastUpdateTime = await simplePriceOracle.getLastUpdateTime();
    
    // Convert BigInt to Number for safe division (or use a string format for display)
    console.log(`Current ETH price: $${ethers.formatUnits(ethPrice, 18)}`);
    console.log(`Last update time: ${new Date(Number(lastUpdateTime) * 1000).toISOString()}`);
    
    // Verify roles were set up correctly
    console.log("\n=== Role Verification ===");
    const DEFAULT_ADMIN_ROLE = await simplePriceOracle.DEFAULT_ADMIN_ROLE();
    const PRICE_UPDATER_ROLE = await simplePriceOracle.PRICE_UPDATER_ROLE();
    
    // Check if the deployer has all roles
    const hasAdminRole = await simplePriceOracle.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const hasPriceUpdaterRole = await simplePriceOracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
    
    console.log(`Admin role: ${hasAdminRole ? '✓' : '✗'}`);
    console.log(`Price updater role: ${hasPriceUpdaterRole ? '✓' : '✗'}`);
    
    console.log("\n=== Conversion Tests ===");

const oneEth = ethers.parseEther("1.0");
const usdValue = await simplePriceOracle.ethToUsd(oneEth);
console.log(`1 ETH = $${ethers.formatUnits(usdValue, 18)}`);

// 修改成 18 位小数
const oneHundredUsd = ethers.parseUnits("100.0", 18); // $100 with 18 decimals
const ethValue = await simplePriceOracle.usdToEth(oneHundredUsd);
console.log(`$100 = ${ethers.formatEther(ethValue)} ETH`);
    
    // Wait for confirmations before suggesting verification
    console.log(`\nWaiting for ${CONFIG.waitConfirmations} confirmations before verification...`);
    const receipt = await simplePriceOracle.deploymentTransaction().wait(CONFIG.waitConfirmations);
    console.log(`Confirmed at block #${receipt.blockNumber}`);
    
    // Log instructions for contract verification
    console.log("\n=== Contract Verification ===");
    console.log(`To verify on Etherscan:`);
    console.log(`npx hardhat verify --network ${network.name} ${contractAddress} ${deployer.address} ${CONFIG.initialEthPrice}`);
    
    // Save deployment details to a file
    const fs = require("fs");
    const path = require("path");
    
    const deployData = {
      network: network.name,
      contractName: "SimplePriceOracle",
      contractAddress: contractAddress,
      deployer: deployer.address,
      deploymentTimestamp: new Date().toISOString(),
      oracleDetails: {
        initialEthPrice: CONFIG.initialEthPrice.toString(),  // convert BigInt into string
        initialEthPriceUSD: Number(ethers.formatUnits(CONFIG.initialEthPrice, 18))  
      }
    };
    
    const deploymentsDir = path.join(__dirname, "../../deployments");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const filePath = path.join(deploymentsDir, `${network.name}-SimplePriceOracle.json`);
    fs.writeFileSync(filePath, JSON.stringify(deployData, null, 2));
    console.log(`\nDeployment details saved to: ${filePath}`);
    
  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });