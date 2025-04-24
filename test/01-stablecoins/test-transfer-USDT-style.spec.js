// scripts/01-stablecoins/test-simple-dollar-functions.js
const { ethers } = require("hardhat");

// Configuration
const TARGET_ADDRESS = "0x6185E23677DEb8E13599e4De2DBC2b717874AE82"; // Address to test transfers and blacklisting
const BURN_AMOUNT = 10000; // Amount of tokens to burn (10k)
const CONTRACT_ADDRESS = "0xE2997d5036dF4b7d679C62cc7e87592a81d36768"; // Replace with your deployed contract address

async function main() {
  try {
    // Get the signer (deployer)
    const [deployer] = await ethers.getSigners();
    console.log("\n=== SimpleDollar Functionality Test ===");
    console.log("Network:", network.name);
    console.log("Testing with account:", deployer.address);
    
    // Connect to the deployed SimpleDollar contract
    console.log(`\nConnecting to SimpleDollar at ${CONTRACT_ADDRESS}...`);
    const SimpleDollar = await ethers.getContractFactory("SimpleDollar");
    const simpleDollar = SimpleDollar.attach(CONTRACT_ADDRESS);
    
    // Verify roles (Test #4: Role Verification)
    console.log("\n=== TEST #4: Role Verification ===");
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
    
    // Get initial balances
    const deployerBalance = await simpleDollar.balanceOf(deployer.address);
    const targetBalance = await simpleDollar.balanceOf(TARGET_ADDRESS);
    const decimals = await simpleDollar.decimals();
    
    console.log("\n=== Initial Balances ===");
    console.log(`Deployer: ${ethers.formatUnits(deployerBalance, decimals)} USD`);
    console.log(`Target: ${ethers.formatUnits(targetBalance, decimals)} USD`);
    
    // Test #1: Transfer tokens to target account
    console.log("\n=== TEST #1: Transfer Tokens ===");
    console.log(`Transferring 100,000 USD to ${TARGET_ADDRESS}...`);
    
    const transferAmount = ethers.parseUnits("100000", decimals);
    try {
      const transferTx = await simpleDollar.transfer(TARGET_ADDRESS, transferAmount);
      await transferTx.wait();
      console.log("Transfer successful! ✅");
      
      // Check new balances
      const newDeployerBalance = await simpleDollar.balanceOf(deployer.address);
      const newTargetBalance = await simpleDollar.balanceOf(TARGET_ADDRESS);
      
      console.log("\n=== Updated Balances After Transfer ===");
      console.log(`Deployer: ${ethers.formatUnits(newDeployerBalance, decimals)} USD`);
      console.log(`Target: ${ethers.formatUnits(newTargetBalance, decimals)} USD`);
    } catch (error) {
      console.error("Transfer failed:", error.message);
    }
    
    // Test #2: Burn 10,000 tokens
    console.log(`\n=== TEST #2: Burn Tokens ===`);
    console.log(`Burning ${BURN_AMOUNT} USD...`);
    
    const burnAmount = ethers.parseUnits(BURN_AMOUNT.toString(), decimals);
    try {
      const burnTx = await simpleDollar.burn(burnAmount);
      await burnTx.wait();
      console.log("Burn successful! ✅");
      
      // Check new balance
      const afterBurnBalance = await simpleDollar.balanceOf(deployer.address);
      console.log(`Deployer balance after burn: ${ethers.formatUnits(afterBurnBalance, decimals)} USD`);
    } catch (error) {
      console.error("Burn failed:", error.message);
    }
    
    // Test #3: Blacklist target account and attempt transfer
    console.log(`\n=== TEST #3: Blacklist and Transfer ===`);
    console.log(`Adding ${TARGET_ADDRESS} to blacklist...`);
    
    try {
      // First check if the address is already blacklisted
      const isAlreadyBlacklisted = await simpleDollar.isBlacklisted(TARGET_ADDRESS);
      if (isAlreadyBlacklisted) {
        console.log("Target address is already blacklisted. Removing from blacklist first...");
        const removeTx = await simpleDollar.removeFromBlacklist(TARGET_ADDRESS);
        await removeTx.wait();
      }
      
      // Add to blacklist
      const blacklistTx = await simpleDollar.blacklist(TARGET_ADDRESS);
      await blacklistTx.wait();
      console.log("Blacklisting successful! ✅");
      
      // Verify blacklist status
      const isBlacklisted = await simpleDollar.isBlacklisted(TARGET_ADDRESS);
      console.log(`Is target blacklisted? ${isBlacklisted ? 'Yes ✓' : 'No ✗'}`);
      
      // Try to transfer to blacklisted address
      console.log(`\nAttempting to transfer 50,000 USD to blacklisted address...`);
      const blacklistedTransferAmount = ethers.parseUnits("50000", decimals);
      
      try {
        const failedTransferTx = await simpleDollar.transfer(TARGET_ADDRESS, blacklistedTransferAmount);
        await failedTransferTx.wait();
        console.log("❌ ERROR: Transfer to blacklisted address succeeded when it should have failed!");
      } catch (error) {
        console.log("✅ Transfer correctly failed as expected");
        console.log(`Error message: ${error.message.split('\n')[0]}`);
      }
    } catch (error) {
      console.error("Blacklisting test failed:", error.message);
    }
    
    // Remove from blacklist (cleanup)
    console.log(`\n=== Cleanup: Removing from Blacklist ===`);
    try {
      const removeTx = await simpleDollar.removeFromBlacklist(TARGET_ADDRESS);
      await removeTx.wait();
      console.log("Target address removed from blacklist ✅");
      
      // Verify blacklist status
      const isStillBlacklisted = await simpleDollar.isBlacklisted(TARGET_ADDRESS);
      console.log(`Is target still blacklisted? ${isStillBlacklisted ? 'Yes ❌' : 'No ✓'}`);
    } catch (error) {
      console.error("Failed to remove from blacklist:", error.message);
    }
    
    console.log("\n=== All Tests Completed ===");
    
  } catch (error) {
    console.error("\n❌ Testing failed:");
    console.error(error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });