// scripts/01-stablecoins/simple-withdraw.js
const { ethers } = require("hardhat");

async function main() {
  console.log("\n=== Simple ETH Withdrawal Script ===");
  console.log("Network:", network.name);
  
  const [account] = await ethers.getSigners();
  console.log("Account address:", account.address);
  
  const initialBalance = await ethers.provider.getBalance(account.address);
  console.log("Initial ETH balance:", ethers.formatEther(initialBalance), "ETH");
  
  const collateralizedStablecoinAddress = "0x9265B112261C979104aFf65beA33587CB79DE897";
  const CollateralizedStablecoin = await ethers.getContractFactory("CollateralizedStablecoin");
  const stablecoin = CollateralizedStablecoin.attach(collateralizedStablecoinAddress);
  
  // Connect to Oracle
  const oracleAddress = await stablecoin.priceOracle();
  const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
  const oracle = SimplePriceOracle.attach(oracleAddress);
  
  try {
    // Step 1: Check vault status
    console.log("\n--- Step 1: Checking Current State ---");
    
    const vaultSummary = await stablecoin.getVaultSummary(account.address);
    console.log("Current Vault - Collateral:", ethers.formatEther(vaultSummary[0]), "ETH, Debt:", ethers.formatUnits(vaultSummary[1], 18), "cUSD");
    console.log("Current ratio:", Number(vaultSummary[2]) / Number(await stablecoin.BASE_PRECISION()) * 100, "%");
    
    // Step 2: Set ETH price as high as possible
    console.log("\n--- Step 2: Setting High ETH Price ---");
    const PRICE_UPDATER_ROLE = await oracle.PRICE_UPDATER_ROLE();
    const hasPriceUpdaterRole = await oracle.hasRole(PRICE_UPDATER_ROLE, account.address);
    
    if (hasPriceUpdaterRole) {
      console.log("Setting ETH price to $10000...");
      const safePrice = ethers.parseUnits("10000.0", 18);
      const updateTx = await oracle.updatePrice(safePrice);
      await updateTx.wait();
      
      const newPrice = await oracle.getEthPrice();
      console.log("New ETH price: $" + ethers.formatUnits(newPrice, 18));
    } else {
      console.log("Cannot update price - account does not have PRICE_UPDATER_ROLE");
    }
    
    // Step 3: Just withdraw 99.9% of collateral
    console.log("\n--- Step 3: Withdrawing 99.9% of Collateral ---");
    const updatedVault = await stablecoin.getVaultSummary(account.address);
    
    if (updatedVault[0] > 0) {
      // Calculate 99.9% of collateral
      const withdrawAmount = updatedVault[0] * 999n / 1000n;
      console.log(`Withdrawing ${ethers.formatEther(withdrawAmount)} ETH (99.9% of total ${ethers.formatEther(updatedVault[0])} ETH)...`);
      
      try {
        const withdrawTx = await stablecoin.withdrawCollateral(withdrawAmount);
        await withdrawTx.wait();
        
        console.log("Successfully withdrew 99.9% of collateral!");
        console.log(`Left ${ethers.formatEther(updatedVault[0] - withdrawAmount)} ETH in the vault.`);
      } catch (error) {
        console.log("Error withdrawing 99.9%:", error.message);
        
        // Try withdrawing 99% instead
        console.log("Trying to withdraw 99% instead...");
        const fallbackWithdrawAmount = updatedVault[0] * 99n / 100n;
        
        try {
          const fallbackTx = await stablecoin.withdrawCollateral(fallbackWithdrawAmount);
          await fallbackTx.wait();
          console.log(`Successfully withdrew ${ethers.formatEther(fallbackWithdrawAmount)} ETH (99% of total).`);
        } catch (fallbackError) {
          console.log("Error withdrawing 99%:", fallbackError.message);
          
          // Try withdrawing 90% as a last resort
          console.log("Trying to withdraw 90% as a last resort...");
          const lastResortAmount = updatedVault[0] * 90n / 100n;
          
          try {
            const lastResortTx = await stablecoin.withdrawCollateral(lastResortAmount);
            await lastResortTx.wait();
            console.log(`Successfully withdrew ${ethers.formatEther(lastResortAmount)} ETH (90% of total).`);
          } catch (lastError) {
            console.log("Still unable to withdraw collateral:", lastError.message);
          }
        }
      }
    } else {
      console.log("No collateral to withdraw.");
    }
    
    // Calculate ETH recovered
    const finalBalance = await ethers.provider.getBalance(account.address);
    console.log("\nFinal ETH balance:", ethers.formatEther(finalBalance), "ETH");
    console.log(`ETH change: ${ethers.formatEther(finalBalance - initialBalance)} ETH`);
    
    // Final vault check
    const finalVault = await stablecoin.getVaultSummary(account.address);
    console.log("\nFinal Vault - Collateral:", ethers.formatEther(finalVault[0]), "ETH, Debt:", ethers.formatUnits(finalVault[1], 18), "cUSD");
    
  } catch (error) {
    console.error("Error during withdrawal:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })