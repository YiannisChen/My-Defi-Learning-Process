// scripts/01-stablecoins/cleanup-eth.js
const { ethers } = require("hardhat");

async function main() {
  console.log("\n=== ETH Recovery Cleanup Script (99.9% Withdrawal) ===");
  console.log("Network:", network.name);
  
  const [account] = await ethers.getSigners();
  console.log("Account address:", account.address);
  
  const initialBalance = await ethers.provider.getBalance(account.address);
  console.log("Initial ETH balance:", ethers.formatEther(initialBalance), "ETH");
  
  const collateralizedStablecoinAddress = "0x9265B112261C979104aFf65beA33587CB79DE897";
  const CollateralizedStablecoin = await ethers.getContractFactory("CollateralizedStablecoin");
  const stablecoin = CollateralizedStablecoin.attach(collateralizedStablecoinAddress);
  
  // Connect to Oracle (to reset price if needed)
  const oracleAddress = await stablecoin.priceOracle();
  const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
  const oracle = SimplePriceOracle.attach(oracleAddress);
  
  try {
    // Step 1: Check vault status
    console.log("\n--- Step 1: Checking Current State ---");
    
    const vaultSummary = await stablecoin.getVaultSummary(account.address);
    console.log("Current Vault - Collateral:", ethers.formatEther(vaultSummary[0]), "ETH, Debt:", ethers.formatUnits(vaultSummary[1], 18), "cUSD");
    console.log("Current ratio:", Number(vaultSummary[2]) / Number(await stablecoin.BASE_PRECISION()) * 100, "%");
    
    const cUSDBalance = await stablecoin.balanceOf(account.address);
    console.log("cUSD balance:", ethers.formatUnits(cUSDBalance, 18), "cUSD");
    
    // Step 2: Reset ETH price to a high value (if we have permission)
    console.log("\n--- Step 2: Resetting ETH Price ---");
    const PRICE_UPDATER_ROLE = await oracle.PRICE_UPDATER_ROLE();
    const hasPriceUpdaterRole = await oracle.hasRole(PRICE_UPDATER_ROLE, account.address);
    
    if (hasPriceUpdaterRole) {
      console.log("Increasing ETH price to $5000 for easier cleanup...");
      const safePrice = ethers.parseUnits("5000.0", 18);
      const updateTx = await oracle.updatePrice(safePrice);
      await updateTx.wait();
      
      const newPrice = await oracle.getEthPrice();
      console.log("New ETH price: $" + ethers.formatUnits(newPrice, 18));
    } else {
      console.log("Cannot update price - account does not have PRICE_UPDATER_ROLE");
    }
    
    // Step 3: Repay any debt
    if (vaultSummary[1] > 0) {
      console.log("\n--- Step 3: Repaying Debt ---");
      const debtToRepay = vaultSummary[1];
      
      // Check if we have enough cUSD
      if (cUSDBalance < debtToRepay) {
        console.log(`Insufficient cUSD balance. Need to mint ${ethers.formatUnits(debtToRepay - cUSDBalance, 18)} more cUSD.`);
        
        // Add more collateral regardless to ensure we have enough for minting
        const safetyMargin = ethers.parseEther("0.2");
        console.log(`Adding ${ethers.formatEther(safetyMargin)} ETH as additional collateral...`);
        const addCollateralTx = await stablecoin.addCollateral({ value: safetyMargin });
        await addCollateralTx.wait();
          
        console.log("Additional collateral added successfully!");
        
        // Mint the required cUSD with a little extra for buffer
        const mintAmount = (debtToRepay - cUSDBalance) * 101n / 100n; // 1% extra
        console.log(`Minting ${ethers.formatUnits(mintAmount, 18)} cUSD to repay debt...`);
        const mintTx = await stablecoin.generateDebt(mintAmount);
        await mintTx.wait();
        
        console.log("Successfully minted additional cUSD!");
      }
      
      // Now repay all debt
      console.log(`Repaying ${ethers.formatUnits(debtToRepay, 18)} cUSD of debt...`);
      const repayTx = await stablecoin.repayDebt(debtToRepay);
      await repayTx.wait();
      
      console.log("All debt repaid successfully!");
    } else {
      console.log("\n--- Step 3: No Debt to Repay ---");
    }
    
    // Step 4: Withdraw 99.9% of collateral
    console.log("\n--- Step 4: Withdrawing 99.9% of Collateral ---");
    const updatedVault = await stablecoin.getVaultSummary(account.address);
    
    if (updatedVault[0] > 0) {
      // Calculate 99.9% of collateral
      const withdrawAmount = updatedVault[0] * 999n / 1000n;
      console.log(`Withdrawing ${ethers.formatEther(withdrawAmount)} ETH (99.9% of total ${ethers.formatEther(updatedVault[0])} ETH)...`);
      
      try {
        const withdrawTx = await stablecoin.withdrawCollateral(withdrawAmount);
        await withdrawTx.wait();
        
        console.log("Successfully withdrew 99.9% of collateral!");
        console.log(`Left ${ethers.formatEther(updatedVault[0] - withdrawAmount)} ETH in the vault for safety.`);
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
          
          // Try withdrawing 95% as a last resort
          console.log("Trying to withdraw 95% as a last resort...");
          const lastResortAmount = updatedVault[0] * 95n / 100n;
          
          try {
            const lastResortTx = await stablecoin.withdrawCollateral(lastResortAmount);
            await lastResortTx.wait();
            console.log(`Successfully withdrew ${ethers.formatEther(lastResortAmount)} ETH (95% of total).`);
          } catch (lastError) {
            console.log("Still unable to withdraw collateral:", lastError.message);
          }
        }
      }
    } else {
      console.log("No collateral to withdraw.");
    }
    
    // Step 5: Burn any remaining cUSD
    console.log("\n--- Step 5: Burning Remaining cUSD ---");
    const finalCUSDBalance = await stablecoin.balanceOf(account.address);
    
    if (finalCUSDBalance > 0) {
      console.log(`Burning ${ethers.formatUnits(finalCUSDBalance, 18)} cUSD...`);
      const burnTx = await stablecoin.burn(finalCUSDBalance);
      await burnTx.wait();
      
      console.log("Successfully burned all remaining cUSD!");
    } else {
      console.log("No cUSD to burn.");
    }
    
    // Step 6: Final verification
    console.log("\n--- Step 6: Final Verification ---");
    const finalVault = await stablecoin.getVaultSummary(account.address);
    console.log("Final Vault - Collateral:", ethers.formatEther(finalVault[0]), "ETH, Debt:", ethers.formatUnits(finalVault[1], 18), "cUSD");
    
    const finalCUSD = await stablecoin.balanceOf(account.address);
    console.log("Final cUSD balance:", ethers.formatUnits(finalCUSD, 18), "cUSD");
    
    // Calculate ETH recovered
    const finalBalance = await ethers.provider.getBalance(account.address);
    console.log("\nFinal ETH balance:", ethers.formatEther(finalBalance), "ETH");
    console.log(`ETH ${finalBalance > initialBalance ? "recovered" : "spent"}: ${ethers.formatEther((finalBalance - initialBalance).abs())} ETH`);
    
    // Summarize previous steps and what was learned
    console.log("\n=== DeFi Learning Summary ===");
    console.log("In this project, you've learned about:");
    console.log("1. Collateralized stablecoins with over-collateralization (similar to DAI)");
    console.log("2. Managing collateralization ratio (currently set at 150%)");
    console.log("3. Liquidation mechanisms and thresholds (125%)");
    console.log("4. Price oracle integration and importance");
    console.log("5. Stability fees accruing over time");
    console.log("");
    console.log("The small amount of ETH left in the vault is a common practice in DeFi,");
    console.log("as precision issues and rounding can make 100% withdrawals challenging.");
    console.log("");
    console.log("For production systems, additional considerations would include:");
    console.log("- More sophisticated liquidation auctions (as in MakerDAO)");
    console.log("- Emergency shutdown mechanisms");
    console.log("- Governance for parameter adjustment");
    console.log("- Multiple collateral types");
    
  } catch (error) {
    console.error("Error during cleanup:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });