// scripts/01-stablecoins/test-sepolia-connection.js
const { ethers } = require("hardhat");

async function main() {
  try {
    // Get the provider and network information
    const provider = ethers.provider;
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Check your account
    const [signer] = await ethers.getSigners();
    const address = await signer.getAddress();
    console.log(`Account address: ${address}`);
    
    // Check balance
    const balance = await provider.getBalance(address);
    console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);
    // Or alternative approach:
    // console.log(`Account balance: ${balance.toString() / 1e18} ETH`);
    
    console.log("Connection test successful! ✅");
  } catch (error) {
    console.error("Connection test failed:");
    console.error(error);
    process.exit(1);
  }


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });