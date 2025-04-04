/*
Deploying MockDAI contract...
MockDAI deployed to: 0xde9ac1826329d2B1b638741C83ccaA68Bf8EFEF6
Deployer address: 0x60F14B03929A7696Ae91468fc2206ea618F80715
Deployer balance: 10000.0 mDAI
Verifying contract on Etherscan...
Waiting for block confirmations...
Successfully submitted source code for contract
contracts/02-erc4626-vault/tokens/MockDai.sol:MockDAI at 0xde9ac1826329d2B1b638741C83ccaA68Bf8EFEF6
for verification on the block explorer. Waiting for verification result...

Successfully verified contract MockDAI on the block explorer.
https://sepolia.etherscan.io/address/0xde9ac1826329d2B1b638741C83ccaA68Bf8EFEF6#code

Contract verified on Etherscan!
*/

// scripts/deploy-mDAI.js
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying MockDAI contract...");

  // Initial supply of 10,000 DAI with 18 decimals
  const initialSupply = ethers.parseUnits("10000", 18);
  
  // Get the contract factory
  const MockDAI = await ethers.getContractFactory("MockDAI");
  
  // Deploy the contract
  const mockDAI = await MockDAI.deploy(initialSupply);
  
  // Wait for deployment to finish
  await mockDAI.waitForDeployment();
  
  const mockDAIAddress = await mockDAI.getAddress();
  console.log(`MockDAI deployed to: ${mockDAIAddress}`);

  // Get the deployer's address
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Get the balance of the deployer
  const balance = await mockDAI.balanceOf(deployer.address);
  console.log(`Deployer balance: ${ethers.formatUnits(balance, 18)} mDAI`);

  console.log("Verifying contract on Etherscan...");
  try {
    // Wait for some block confirmations before verification
    console.log("Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    
    await hre.run("verify:verify", {
      address: mockDAIAddress,
      constructorArguments: [initialSupply],
    });
    console.log("Contract verified on Etherscan!");
  } catch (error) {
    console.error("Error verifying contract:", error);
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });