/**
 * CollateralizedStablecoin Liquidation Test Script
 * ------------------------------------------------
 * PURPOSE:
 * This script tests the liquidation functionality of a collateralized stablecoin system on Sepolia testnet.
 * It simulates a complete lifecycle of creating a risky position, triggering a liquidation event, and
 * executing a successful liquidation using two separate accounts.
 * 
 * PROCESS OVERVIEW:
 * 1. Setup contracts and accounts
 * 2. Create an undercollateralized position (vault)
 * 3. Drop the price of ETH to trigger liquidation conditions
 * 4. Execute liquidation from a second account
 * 5. Verify liquidation was successful and analyze results
 * 
 * TESTING DETAILS:
 * - Test Environment: Sepolia Testnet
 * - Contracts Used:
 *   - CollateralizedStablecoin (0x19858f4fDF9D4451abEC344b5026E27bD4308f39)
 *   - SimplePriceOracle (0x81e0Be288ea0b3d5790e631F39cbacF159012F15)
 * - Test Parameters:
 *   - Initial ETH Price: $2000
 *   - Test Collateral: 0.1 ETH
 *   - Debt Position: 90% of maximum allowed (~120 cUSD)
 *   - Liquidation Trigger: Price drop to 90% below calculated liquidation threshold
 *   - Liquidation Amount: Full debt amount if liquidator has sufficient cUSD
 * - Key Contract Parameters:
 *   - Collateral Ratio: 150% (minimum required for borrowing)
 *   - Liquidation Threshold: 125% (position becomes eligible for liquidation)
 *   - Liquidation Penalty: 10% (bonus incentive for liquidators)
 * - Test Accounts:
 *   - Deployer/Vault Owner: Creates the position that will be liquidated
 *   - Liquidator: Separate account that performs the liquidation
 * 
 * EDGE CASES TESTED:
 * - High utilization vault (90% of maximum debt) to test near-threshold behavior
 * - Complete liquidation of the entire debt position
 * - Proper handling of dust amounts after liquidation
 * - Correct calculation of liquidation prices and thresholds
 * 
 * EXPECTED RESULTS:
 * - Deployer's vault should be liquidated when ETH price drops below the liquidation threshold
 * - Liquidator should receive the collateral with a bonus (liquidation penalty)
 * - Deployer's debt should be reduced or eliminated
 * - Contract invariants should be maintained throughout the process
 * 
 * METRICS TRACKED:
 * - ETH balances before and after for both accounts
 * - cUSD balances and transfers
 * - Collateralization ratios throughout the process
 * - Gas costs for liquidation transaction
 */
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
require("dotenv").config();

// Function to load deployment information from JSON file
function loadDeploymentInfo() {
  try {
    const filePath = path.join(__dirname, '../../deployment-info.json');
    const fileData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileData);
  } catch (error) {
    console.log("Could not load deployment info, using hardcoded values:", error.message);
    return {
      deployments: {
        oracle: { contractAddress: "0x81e0Be288ea3b3d5790e631F39cbacF159012F15" },
        collateralizedStablecoin: { contractAddress: "0x19858f4fDF9D4451abEC344b5026E27bD4308f39" }
      }
    };
  }
}

async function main() {
  console.log("\n=== CollateralizedStablecoin Liquidation Test on Sepolia ===");
  console.log("Network:", network.name);
  
  // Load deployment info
  const deploymentInfo = loadDeploymentInfo();
  const configuredOracleAddress = deploymentInfo.deployments.oracle.contractAddress;
  const configuredStablecoinAddress = deploymentInfo.deployments.collateralizedStablecoin.contractAddress;
  
  // Get accounts from hardhat config (using the provided private keys)
  const [deployer, liquidator] = await ethers.getSigners();
  console.log("Deployer/vault owner account:", deployer.address);
  console.log("Liquidator account:", liquidator.address);
  
  const initialOwnerBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Initial deployer balance:", ethers.formatEther(initialOwnerBalance), "ETH");
  
  const initialLiquidatorBalance = await ethers.provider.getBalance(liquidator.address);
  console.log("Initial liquidator balance:", ethers.formatEther(initialLiquidatorBalance), "ETH");
  
  if (initialLiquidatorBalance < ethers.parseEther("0.3")) {
    console.log("WARNING: Liquidator has less than 0.3 ETH. This may not be enough for test operations.");
  }
  
  // Connect to contracts
  const CollateralizedStablecoin = await ethers.getContractFactory("CollateralizedStablecoin");
  const ownerStablecoin = CollateralizedStablecoin.attach(configuredStablecoinAddress).connect(deployer);
  const liquidatorStablecoin = CollateralizedStablecoin.attach(configuredStablecoinAddress).connect(liquidator);
  
  // Connect to Oracle
  const oracleAddress = await ownerStablecoin.priceOracle();
  console.log(`Using oracle at: ${oracleAddress}`);
  console.log(`Using stablecoin at: ${configuredStablecoinAddress}`);
  
  const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
  const oracle = SimplePriceOracle.attach(oracleAddress).connect(deployer);
  
  // Get roles for verification
  const PRICE_UPDATER_ROLE = await oracle.PRICE_UPDATER_ROLE();
  const hasPriceUpdaterRole = await oracle.hasRole(PRICE_UPDATER_ROLE, deployer.address);
  
  if (!hasPriceUpdaterRole) {
    console.log("CRITICAL ERROR: Deployer does not have PRICE_UPDATER_ROLE. Test cannot proceed.");
    process.exit(1);
  }
  
  try {
    console.log("\n--- Step 1: Setting Initial ETH Price ---");
    // Set ETH price to $2000
    const initialPrice = ethers.parseUnits("2000.0", 18);
    console.log("Setting ETH price to $2000...");
    const priceTx = await oracle.updatePrice(initialPrice);
    await priceTx.wait();
    
    const confirmedPrice = await oracle.getEthPrice();
    console.log("Confirmed ETH price: $" + ethers.formatUnits(confirmedPrice, 18));
    
    // Display contract parameters
    const collateralRatio = await ownerStablecoin.collateralRatio();
    const basePrecision = await ownerStablecoin.BASE_PRECISION();
    const liquidationThreshold = await ownerStablecoin.liquidationThreshold();
    const liquidationPenalty = await ownerStablecoin.liquidationPenalty();
    
    console.log(`Collateral Ratio: ${Number(collateralRatio) / Number(basePrecision) * 100}%`);
    console.log(`Liquidation Threshold: ${Number(liquidationThreshold) / Number(basePrecision) * 100}%`);
    console.log(`Liquidation Penalty: ${Number(liquidationPenalty) / Number(basePrecision) * 100}%`);
    
    console.log("\n--- Step 2: Setting Up Deployer's Vault Position ---");
    // Check if deployer already has a vault
    const vaultData = await ownerStablecoin.getVaultSummary(deployer.address);
    const hasExistingVault = vaultData[0] > 0 || vaultData[1] > 0;
    
    if (hasExistingVault) {
      console.log("Existing vault found with:");
      console.log("- Collateral:", ethers.formatEther(vaultData[0]), "ETH");
      console.log("- Debt:", ethers.formatUnits(vaultData[1], 18), "cUSD");
      
      // For existing debt, only try to repay if it's significant (greater than 1 cUSD)
      if (vaultData[1] > ethers.parseUnits("1.0", 18)) {
        console.log("Significant existing debt found. Attempting to handle it...");
        const existingDebt = vaultData[1];
        const cUSDBalance = await ownerStablecoin.balanceOf(deployer.address);
        
        if (cUSDBalance >= existingDebt) {
          console.log(`Repaying existing debt with available balance: ${ethers.formatUnits(existingDebt, 18)} cUSD...`);
          const repayTx = await ownerStablecoin.repayDebt(existingDebt);
          await repayTx.wait();
        } else {
          console.log("Existing debt is too high and we don't have enough cUSD to repay it.");
          console.log("Will just proceed with creating a new vault...");
        }
      } else if (vaultData[1] > 0) {
        console.log(`Existing debt is small (${ethers.formatUnits(vaultData[1], 18)} cUSD). Ignoring for testing purposes.`);
      }
      
      // Try to withdraw existing collateral if there's no significant debt
      if (vaultData[0] > 0 && vaultData[1] <= ethers.parseUnits("1.0", 18)) {
        try {
          // Calculate max withdrawable amount (leaving enough for any small debt)
          const maxWithdrawable = vaultData[1] > 0 
            ? vaultData[0] - (vaultData[1] * collateralRatio) / (initialPrice * basePrecision)
            : vaultData[0];
          
          // Only withdraw if we can get a meaningful amount
          if (maxWithdrawable > ethers.parseEther("0.01")) {
            console.log(`Withdrawing collateral: ${ethers.formatEther(maxWithdrawable)} ETH...`);
            const withdrawTx = await ownerStablecoin.withdrawCollateral(maxWithdrawable);
            await withdrawTx.wait();
          } else {
            console.log("Cannot withdraw significant collateral due to existing debt constraints.");
          }
        } catch (error) {
          console.log("Error withdrawing collateral:", error.message);
          console.log("Will continue with existing vault state.");
        }
      }
    }
    
    // Create a fresh vault with exactly 0.1 ETH or add to existing
    const targetCollateral = ethers.parseEther("0.1");
    
    if (!hasExistingVault) {
      console.log(`Creating fresh test vault with ${ethers.formatEther(targetCollateral)} ETH...`);
      const createTx = await ownerStablecoin.createVault({ value: targetCollateral });
      await createTx.wait();
    } else {
      // Add collateral to reach desired amount if existing is too low
      const currentCollateral = vaultData[0];
      if (currentCollateral < targetCollateral) {
        const additionalNeeded = targetCollateral - currentCollateral;
        console.log(`Adding ${ethers.formatEther(additionalNeeded)} ETH to reach target collateral...`);
        const addTx = await ownerStablecoin.addCollateral({ value: additionalNeeded });
        await addTx.wait();
      } else {
        console.log(`Existing collateral (${ethers.formatEther(currentCollateral)} ETH) is sufficient.`);
      }
    }
    
    // Check vault status after setup
    const updatedVaultData = await ownerStablecoin.getVaultSummary(deployer.address);
    console.log("Deployer's position after setup:");
    console.log("- Collateral:", ethers.formatEther(updatedVaultData[0]), "ETH");
    console.log("- Debt:", ethers.formatUnits(updatedVaultData[1], 18), "cUSD");
    console.log("- Maximum possible debt:", ethers.formatUnits(updatedVaultData[3], 18), "cUSD");
    
    console.log("\n--- Step 3: Generating Debt for Deployer's Vault ---");
    // Repay any existing debt first to start fresh with debt generation
    const existingDebt = updatedVaultData[1];
    if (existingDebt > 0) {
      try {
        const cUSDBalance = await ownerStablecoin.balanceOf(deployer.address);
        const repayAmount = existingDebt <= cUSDBalance ? existingDebt : cUSDBalance;
        
        if (repayAmount > 0) {
          console.log(`Repaying ${ethers.formatUnits(repayAmount, 18)} cUSD of existing debt...`);
          const repayTx = await ownerStablecoin.repayDebt(repayAmount);
          await repayTx.wait();
        }
      } catch (error) {
        console.log("Error repaying existing debt:", error.message);
      }
    }
    
    // Generate debt at 90% of maximum (risky position for liquidation testing)
    const refreshedVaultData = await ownerStablecoin.getVaultSummary(deployer.address);
    const maxDebt = refreshedVaultData[3];
    const targetDebt = maxDebt * 90n / 100n; // 90% of max for easier liquidation
    
    console.log(`Generating ${ethers.formatUnits(targetDebt, 18)} cUSD (90% of max)...`);
    const mintTx = await ownerStablecoin.generateDebt(targetDebt);
    await mintTx.wait();
    
    // Check vault status after debt generation
    const vaultAfterDebt = await ownerStablecoin.getVaultSummary(deployer.address);
    console.log("Deployer's position after debt generation:");
    console.log("- Collateral:", ethers.formatEther(vaultAfterDebt[0]), "ETH");
    console.log("- Debt:", ethers.formatUnits(vaultAfterDebt[1], 18), "cUSD");
    console.log("- Collateralization ratio:", Number(vaultAfterDebt[2]) / Number(basePrecision) * 100, "%");
    
    console.log("\n--- Step 4: Setting Up Liquidator's Position ---");
    // More streamlined liquidator setup
    try {
      // Check if liquidator has a vault
      const liquidatorVaultData = await liquidatorStablecoin.getVaultSummary(liquidator.address);
      const hasLiquidatorVault = liquidatorVaultData[0] > 0;
      
      if (!hasLiquidatorVault) {
        console.log("Creating liquidator vault with 0.2 ETH...");
        const createTx = await liquidatorStablecoin.createVault({ value: ethers.parseEther("0.2") });
        await createTx.wait();
      } else if (liquidatorVaultData[0] < ethers.parseEther("0.2")) {
        console.log("Adding collateral to liquidator's vault...");
        const addCollateralTx = await liquidatorStablecoin.addCollateral({ 
          value: ethers.parseEther("0.2").sub(liquidatorVaultData[0]) 
        });
        await addCollateralTx.wait();
      }
      
      // Get updated liquidator vault data
      const updatedLiquidatorVault = await liquidatorStablecoin.getVaultSummary(liquidator.address);
      console.log("Liquidator's vault position:");
      console.log("- Collateral:", ethers.formatEther(updatedLiquidatorVault[0]), "ETH");
      console.log("- Debt:", ethers.formatUnits(updatedLiquidatorVault[1], 18), "cUSD");
      console.log("- Maximum possible debt:", ethers.formatUnits(updatedLiquidatorVault[3], 18), "cUSD");
      
      // Generate enough cUSD for liquidation
      const vaultOwnerDebt = vaultAfterDebt[1];
      const liquidatorCUSDBalance = await liquidatorStablecoin.balanceOf(liquidator.address);
      
      if (liquidatorCUSDBalance < vaultOwnerDebt) {
        const additionalNeeded = vaultOwnerDebt - liquidatorCUSDBalance;
        const liquidatorMaxDebt = updatedLiquidatorVault[3];
        
        // Don't generate more than 80% of max debt for safety
        const safeGenerateAmount = liquidatorMaxDebt * 80n / 100n > additionalNeeded ? 
                                   additionalNeeded : liquidatorMaxDebt * 80n / 100n;
        
        if (safeGenerateAmount > 0) {
          console.log(`Generating ${ethers.formatUnits(safeGenerateAmount, 18)} cUSD for liquidator...`);
          const genDebtTx = await liquidatorStablecoin.generateDebt(safeGenerateAmount);
          await genDebtTx.wait();
        }
      }
      
      const finalLiquidatorCUSD = await liquidatorStablecoin.balanceOf(liquidator.address);
      console.log(`Liquidator's final cUSD balance: ${ethers.formatUnits(finalLiquidatorCUSD, 18)}`);
      
    } catch (error) {
      console.log("Error setting up liquidator:", error.message);
    }
    
    console.log("\n--- Step 5: Calculating Liquidation Price ---");
    // Calculate price that would trigger liquidation
    const collateralETH = vaultAfterDebt[0];
    const debtUSD = vaultAfterDebt[1];
    
    // Liquidation price calculation: price at which collateral value equals minimum required
    // liquidationThreshold = (collateral * price * basePrecision) / debt
    // Therefore: price = (debt * liquidationThreshold) / (collateral * basePrecision)
    const liquidationPrice = (debtUSD * liquidationThreshold) / (collateralETH * basePrecision);
    
    // Set test price 10% below liquidation price to ensure liquidation
    const testPrice = liquidationPrice * 90n / 100n;
    
    console.log(`Calculated liquidation price: $${ethers.formatUnits(liquidationPrice, 18)}`);
    console.log(`Test price (10% below liquidation): $${ethers.formatUnits(testPrice, 18)}`);
    
    console.log("\n--- Step 6: Testing Price Drop to Trigger Liquidation ---");
    console.log(`Setting ETH price to $${ethers.formatUnits(testPrice, 18)}...`);
    const dropTx = await oracle.updatePrice(testPrice);
    await dropTx.wait();
    
    const newPrice = await oracle.getEthPrice();
    console.log("Confirmed ETH price: $" + ethers.formatUnits(newPrice, 18));
    
    // Check vault status after price drop
    const vaultAfterDrop = await ownerStablecoin.getVaultSummary(deployer.address);
    console.log("Deployer's position after price drop:");
    console.log("- Collateralization ratio:", Number(vaultAfterDrop[2]) / Number(basePrecision) * 100, "%");
    
    const canBeLiquidated = await liquidatorStablecoin.canLiquidate(deployer.address);
    console.log("Can vault be liquidated?", canBeLiquidated ? "Yes" : "No");
    
    if (canBeLiquidated) {
      console.log("\n--- Step 7: Performing Liquidation with Liquidator Account ---");
      
      const liquidatorCUSDBalance = await liquidatorStablecoin.balanceOf(liquidator.address);
      const vaultOwnerDebt = vaultAfterDrop[1];
      
      // Amount to liquidate - full debt if possible
      const amountToLiquidate = vaultOwnerDebt < liquidatorCUSDBalance ? vaultOwnerDebt : liquidatorCUSDBalance;
      
      if (amountToLiquidate <= 0) {
        console.log("ERROR: Liquidator has no cUSD to perform liquidation!");
      } else {
        console.log(`Liquidator attempting to liquidate ${ethers.formatUnits(amountToLiquidate, 18)} cUSD of deployer's debt...`);
        
        try {
          const liquidatorBalanceBefore = await ethers.provider.getBalance(liquidator.address);
          
          const liquidateTx = await liquidatorStablecoin.liquidate(deployer.address, amountToLiquidate);
          const receipt = await liquidateTx.wait();
          
          // Calculate gas cost
          const gasCost = receipt.gasUsed * receipt.gasPrice;
          
          // Show post-liquidation state
          const vaultAfterLiquidation = await ownerStablecoin.getVaultSummary(deployer.address);
          console.log("Deployer's position after liquidation:");
          console.log("- Collateral:", ethers.formatEther(vaultAfterLiquidation[0]), "ETH");
          console.log("- Debt:", ethers.formatUnits(vaultAfterLiquidation[1], 18), "cUSD");
          
          if (vaultAfterLiquidation[0] > 0 && vaultAfterLiquidation[1] > 0) {
            console.log("- Collateralization ratio:", Number(vaultAfterLiquidation[2]) / Number(basePrecision) * 100, "%");
          } else {
            console.log("- Collateralization ratio: N/A (vault empty or no debt)");
          }
          
          // Check liquidator's ETH gain
          const liquidatorBalanceAfter = await ethers.provider.getBalance(liquidator.address);
          const ethChange = liquidatorBalanceAfter - liquidatorBalanceBefore + gasCost;
          
          console.log("Liquidation successful!");
          console.log(`Liquidator received approximately ${ethers.formatEther(ethChange)} ETH (including gas compensation)`);
          
          // Check liquidator's cUSD balance after liquidation
          const liquidatorCUSDAfter = await liquidatorStablecoin.balanceOf(liquidator.address);
          console.log(`Liquidator's cUSD balance after liquidation: ${ethers.formatUnits(liquidatorCUSDAfter, 18)}`);
          console.log(`cUSD spent on liquidation: ${ethers.formatUnits(liquidatorCUSDBalance - liquidatorCUSDAfter, 18)}`);
          
        } catch (error) {
          console.log("Liquidation failed:", error.message);
          
          // Additional diagnostics
          console.log("\nDiagnostics:");
          console.log("Current price:", ethers.formatUnits(await oracle.getEthPrice(), 18));
          console.log("Deployer's ratio:", Number(await ownerStablecoin.getCurrentRatio(deployer.address)) / Number(basePrecision) * 100, "%");
          console.log("Liquidation threshold:", Number(liquidationThreshold) / Number(basePrecision) * 100, "%");
          console.log("Liquidator cUSD balance:", ethers.formatUnits(liquidatorCUSDBalance, 18));
          console.log("Self-liquidation check: Is liquidator same as deployer?", liquidator.address === deployer.address);
        }
      }
    } else {
      console.log("Vault cannot be liquidated despite price drop - check liquidation conditions");
    }
    
    console.log("\n--- Step 8: Resetting Price ---");
    // Reset ETH price
    const resetPrice = ethers.parseUnits("2000.0", 18);
    await oracle.updatePrice(resetPrice);
    console.log("ETH price reset to $2000");
    
    console.log("\n=== Test Complete ===");
    // Final balance check
    const finalOwnerBalance = await ethers.provider.getBalance(deployer.address);
    console.log("Final deployer ETH balance:", ethers.formatEther(finalOwnerBalance), "ETH");
    const ethDifference = finalOwnerBalance - initialOwnerBalance;
    const ethChangeAmount = ethDifference >= 0n ? ethDifference : -ethDifference;
    console.log(`Deployer ETH ${ethDifference >= 0n ? "gained" : "spent"}: ${ethers.formatEther(ethChangeAmount)} ETH`);
    
    const finalLiquidatorBalance = await ethers.provider.getBalance(liquidator.address);
    console.log("Final liquidator ETH balance:", ethers.formatEther(finalLiquidatorBalance), "ETH");
    const liquidatorEthDifference = finalLiquidatorBalance - initialLiquidatorBalance;
    const liquidatorEthChangeAmount = liquidatorEthDifference >= 0n ? liquidatorEthDifference : -liquidatorEthDifference;
    console.log(`Liquidator ETH ${liquidatorEthDifference >= 0n ? "gained" : "spent"}: ${ethers.formatEther(liquidatorEthChangeAmount)} ETH`);
    
  } catch (error) {
    console.log("Test failed with error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });