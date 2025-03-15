// scripts/01-stablecoins/deploy-collateralized-stablecoin.js
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying CollateralizedStablecoin with existing Oracle...");
  
  // Use the existing oracle
  const existingOracleAddress = "0x81e0Be288ea0b3d5790e631F39cbacF159012F15";
  console.log(`Using existing SimplePriceOracle at: ${existingOracleAddress}`);
  
  // Connect to the existing oracle to verify it
  const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
  const priceOracle = SimplePriceOracle.attach(existingOracleAddress);
  
  // Check current ETH price
  try {
    const currentPrice = await priceOracle.getEthPrice();
    console.log("Current ETH price: $" + ethers.formatUnits(currentPrice, 18));
  } catch (error) {
    console.log("Could not get ETH price from oracle, may need to check the interface");
  }
  
  // Deploy the CollateralizedStablecoin contract
  console.log("Deploying CollateralizedStablecoin...");
  const [deployer] = await ethers.getSigners();
  
  const CollateralizedStablecoin = await ethers.getContractFactory("CollateralizedStablecoin");
  const stablecoin = await CollateralizedStablecoin.deploy(
    deployer.address, // admin
    existingOracleAddress // price oracle address
  );
  await stablecoin.waitForDeployment();
  
  const stablecoinAddress = await stablecoin.getAddress();
  console.log(`CollateralizedStablecoin deployed to: ${stablecoinAddress}`);
  
  // Output deployment info for verification
  console.log("\nDeployment Summary:");
  console.log(`SimplePriceOracle: ${existingOracleAddress}`);
  console.log(`CollateralizedStablecoin: ${stablecoinAddress}`);
  console.log(`Admin Address: ${deployer.address}`);
  
  // Verify roles
  const DEFAULT_ADMIN_ROLE = await stablecoin.DEFAULT_ADMIN_ROLE();
  const PAUSER_ROLE = await stablecoin.PAUSER_ROLE();
  const LIQUIDATOR_ROLE = await stablecoin.LIQUIDATOR_ROLE();
  
  console.log("\nRole Verification:");
  console.log(`Admin Role for deployer: ${await stablecoin.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)}`);
  console.log(`Pauser Role for deployer: ${await stablecoin.hasRole(PAUSER_ROLE, deployer.address)}`);
  console.log(`Liquidator Role for deployer: ${await stablecoin.hasRole(LIQUIDATOR_ROLE, deployer.address)}`);
  
  // Save deployment information to a file (optional)
  // You may want to add code here to save the deployment details
  
  console.log("\nDeployment complete! Make sure to save the contract addresses.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });