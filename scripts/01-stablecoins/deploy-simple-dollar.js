// scripts/01-stablecoins/deploy-simple-dollar.js
const { ethers } = require("hardhat");

const CONFIG = {
  initialMint: 1000000, // 1 million tokens initial mint
  recipientAddress: null, 
  waitConfirmations: 5
};

async function main() {
  try {
    // Get the deployer's address
    const [deployer] = await ethers.getSigners();
    console.log("\n=== SimpleDollar Deployment ===");
    console.log("Network:", network.name);
    console.log("Deploying with account:", deployer.address);
    
    // Check balance 
    const balanceBefore = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer balance before: ${ethers.formatEther(balanceBefore)} ETH`);
    
    // Deploy contract 
    console.log("\nDeploying SimpleDollar...");
    const SimpleDollar = await ethers.getContractFactory("SimpleDollar");
    const simpleDollar = await SimpleDollar.deploy(deployer.address);
    
    // Wait for deployment 
    console.log("Waiting for transaction confirmation...");
    await simpleDollar.waitForDeployment();
    
    // Get contract address
    const contractAddress = await simpleDollar.getAddress();
    console.log(`\nSimpleDollar deployed successfully! ✅`);
    console.log(`Contract address: ${contractAddress}`);
    
    // gas 
    const balanceAfter = await ethers.provider.getBalance(deployer.address);
    console.log(`\nDeployer balance after: ${ethers.formatEther(balanceAfter)} ETH`);
    console.log(`Gas used: ${ethers.formatEther(balanceBefore - balanceAfter)} ETH`);
    
    // Verify token details
    console.log("\n=== Token Details ===");
    const tokenName = await simpleDollar.name();
    const tokenSymbol = await simpleDollar.symbol();
    const tokenDecimals = await simpleDollar.decimals();
    
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Decimals: ${tokenDecimals}`);
    
    // Verify roles were set up correctly
    console.log("\n=== Role Verification ===");
    const DEFAULT_ADMIN_ROLE = await simpleDollar.DEFAULT_ADMIN_ROLE();
    const MINTER_ROLE = await simpleDollar.MINTER_ROLE();
    const PAUSER_ROLE = await simpleDollar.PAUSER_ROLE();
    const BLACKLISTER_ROLE = await simpleDollar.BLACKLISTER_ROLE();
    
    // Check if the deployer has all roles
    const hasAdminRole = await simpleDollar.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const hasMinterRole = await simpleDollar.hasRole(MINTER_ROLE, deployer.address);
    const hasPauserRole = await simpleDollar.hasRole(PAUSER_ROLE, deployer.address);
    const hasBlacklisterRole = await simpleDollar.hasRole(BLACKLISTER_ROLE, deployer.address);
    
    console.log(`Admin role: ${hasAdminRole ? '✓' : '✗'}`);
    console.log(`Minter role: ${hasMinterRole ? '✓' : '✗'}`);
    console.log(`Pauser role: ${hasPauserRole ? '✓' : '✗'}`);
    console.log(`Blacklister role: ${hasBlacklisterRole ? '✓' : '✗'}`);
    
    // Mint initial tokens if configured
    if (CONFIG.initialMint > 0) {
      const recipient = CONFIG.recipientAddress || deployer.address;
      console.log(`\n=== Initial Token Minting ===`);
      console.log(`Minting ${CONFIG.initialMint} tokens to ${recipient}...`);
      
      // Convert to proper token units (6 decimals)
      const mintAmount = ethers.parseUnits(CONFIG.initialMint.toString(), await simpleDollar.decimals());
      
      try {
        const mintTx = await simpleDollar.mint(recipient, mintAmount);
        await mintTx.wait();
        
        // Verify the balance
        const balance = await simpleDollar.balanceOf(recipient);
        console.log(`Mint successful! ✅`);
        console.log(`Recipient balance: ${ethers.formatUnits(balance, await simpleDollar.decimals())} ${tokenSymbol}`);
      } catch (error) {
        console.error(`Error during initial minting: ${error.message}`);
      }
    }
    
    // Wait for confirmations before suggesting verification
    console.log(`\nWaiting for ${CONFIG.waitConfirmations} confirmations before verification...`);
    const receipt = await simpleDollar.deploymentTransaction().wait(CONFIG.waitConfirmations);
    console.log(`Confirmed at block #${receipt.blockNumber}`);
    
    // Log instructions for contract verification
    console.log("\n=== Contract Verification ===");
    console.log(`To verify on Etherscan:`);
    console.log(`npx hardhat verify --network ${network.name} ${contractAddress} ${deployer.address}`);
    
    // Save deployment details to a file
    const fs = require("fs");
    const path = require("path");
    
    const deployData = {
      network: network.name,
      contractName: "SimpleDollar",
      contractAddress: contractAddress,
      deployer: deployer.address,
      deploymentTimestamp: new Date().toISOString(),
      tokenDetails: {
        name: tokenName,
        symbol: tokenSymbol,
        decimals: tokenDecimals
      }
    };
    
    const deploymentsDir = path.join(__dirname, "../../deployments");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const filePath = path.join(deploymentsDir, `${network.name}-SimpleDollar.json`);
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