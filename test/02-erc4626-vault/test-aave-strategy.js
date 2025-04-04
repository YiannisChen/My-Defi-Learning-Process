// test/02-erc4626-vault/test-aave-strategy.js

/*
(base) yiannischen@YiannisdeMacBook-Pro My-Defi-Learning-Process % npx hardhat run test/02-erc4626-vault/test-aave-strategy.js --network sepolia
Starting AaveStrategy test on Sepolia...
Using account: 0x60F14B03929A7696Ae91468fc2206ea618F80715
ETH Balance: 4.632632876327389365

--- Step 1: Check DAI Balance ---
DAI has 18 decimals
DAI Balance: 10000.0 DAI

--- Step 2: Verify aDAI Token ---
Current aDAI Balance: 0.0 aDAI
✅ Successfully connected to aDAI token at: 0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8

--- Step 3: Deploy AaveStrategy ---
Deploying AaveStrategy contract...
✅ AaveStrategy deployed to: 0x15D2c56Fe5e62634638292f36DD5E479F16d5B2d

--- Step 4: Set up Vault ---
Setting deployer as vault for testing purposes...
✅ Vault set successfully.

--- Step 5: Approve & Deposit ---
Approving strategy to spend 100.0 DAI...
✅ Approval successful.
Attempting to deposit 10.0 DAI...
Executing deposit transaction...
Deposit transaction submitted. Waiting for confirmation...
✅ Deposit transaction successful! Hash: 0xa0ce3df1cd3309333aa3bffe432c029d6a6c6fa978493f8a7bbe8be72cedf515

--- Step 6: Check Post-Deposit State ---
Total value in strategy: 10.0 DAI
Total deposited tracked by strategy: 10.0 DAI
Strategy aDAI balance: 0.0 aDAI
Loose DAI in strategy: 10.0 DAI
Estimated APY: 3%

--- Step 7: Test Harvest ---
Attempting to harvest yield (will likely be minimal initially)...
✅ Harvest completed! Hash: 0x6d70573ff62029239ed47edad22361725be54183ea67f05b844925ecd1bdb041

--- Step 8: Test Withdrawal ---
Withdrawing 5.0 DAI...
✅ Withdrawal successful! Hash: 0x1b539a630716068b49ce409b82a6a8833c7a84942c6d2b93ae932150727b7e18

--- Final State Check ---
Final DAI balance: 9990.0 DAI
Final value in strategy: 10.0 DAI

--- Step 9: Test WithdrawAll ---
Withdrawing all remaining funds...
✅ WithdrawAll successful! Hash: 0xc7737c76eae5fba9349238fe084972beb1df8d3f9b1899e475f6fa0a8f0ec512
Value in strategy after withdrawAll: 10.0 DAI
Final DAI balance after withdrawAll: 9990.0 DAI

✅✅✅ Test completed successfully! ✅✅✅
Strategy address: 0x15D2c56Fe5e62634638292f36DD5E479F16d5B2d
*/

const { ethers } = require("hardhat");

async function main() {
  try {
    console.log("Starting AaveStrategy test on Sepolia...");
    
    // Get the signer
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);
    
    // Log account balance (ETH)
    const ethBalance = await ethers.provider.getBalance(deployer.address);
    console.log("ETH Balance:", ethers.formatEther(ethBalance));
    
    // Token addresses on Sepolia - these are the correct addresses for Aave V3 on Sepolia
    const DAI_ADDRESS = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357";
    const ADAI_ADDRESS = "0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8"; // Hardcoded aDAI address
    const AAVE_POOL_ADDRESS = "0x6C9fB0D5bD9429eb9Cd96B85B81d872281771E6B";
    
    console.log("\n--- Step 1: Check DAI Balance ---");
    // Create DAI contract instance
    const daiAbi = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function approve(address spender, uint256 amount) returns (bool)"
    ];
    const dai = new ethers.Contract(DAI_ADDRESS, daiAbi, deployer);
    
    // Get DAI decimals to format amounts correctly
    const daiDecimals = await dai.decimals();
    console.log(`DAI has ${daiDecimals} decimals`);
    
    // Check DAI balance
    const daiBalance = await dai.balanceOf(deployer.address);
    console.log(`DAI Balance: ${ethers.formatUnits(daiBalance, daiDecimals)} DAI`);
    
    if (daiBalance.toString() === '0') {
      console.error("❌ No DAI balance! Please get some DAI from the Aave faucet before testing.");
      return;
    }
    
    console.log("\n--- Step 2: Verify aDAI Token ---");
    // Create aToken contract instance to check details
    const aTokenAbi = [
      "function balanceOf(address owner) view returns (uint256)"
    ];
    const aToken = new ethers.Contract(ADAI_ADDRESS, aTokenAbi, deployer);
    
    // Check if deployer has any aDAI already
    try {
      const aTokenBalance = await aToken.balanceOf(deployer.address);
      console.log(`Current aDAI Balance: ${ethers.formatUnits(aTokenBalance, daiDecimals)} aDAI`);
      console.log("✅ Successfully connected to aDAI token at:", ADAI_ADDRESS);
    } catch (error) {
      console.warn("⚠️ Could not verify aDAI token:", error.message);
      console.log("Continuing with hardcoded address:", ADAI_ADDRESS);
    }
    
    console.log("\n--- Step 3: Deploy AaveStrategy ---");
    console.log("Deploying AaveStrategy contract...");
    try {
      const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
      const aaveStrategy = await AaveStrategy.deploy(
        DAI_ADDRESS,
        AAVE_POOL_ADDRESS,
        ADAI_ADDRESS,
        "Aave DAI Strategy"
      );
      
      await aaveStrategy.waitForDeployment();
      const strategyAddress = await aaveStrategy.getAddress();
      console.log("✅ AaveStrategy deployed to:", strategyAddress);
      
      console.log("\n--- Step 4: Set up Vault ---");
      console.log("Setting deployer as vault for testing purposes...");
      try {
        const setVaultTx = await aaveStrategy.setVault(deployer.address);
        await setVaultTx.wait();
        console.log("✅ Vault set successfully.");
        
        console.log("\n--- Step 5: Approve & Deposit ---");
        // Approve strategy to spend DAI
        const approvalAmount = ethers.parseUnits("100", daiDecimals); // 100 DAI
        console.log(`Approving strategy to spend ${ethers.formatUnits(approvalAmount, daiDecimals)} DAI...`);
        
        try {
          const approveTx = await dai.approve(strategyAddress, approvalAmount);
          await approveTx.wait();
          console.log("✅ Approval successful.");
          
          // Deposit DAI
          const depositAmount = ethers.parseUnits("10", daiDecimals); // 10 DAI
          console.log(`Attempting to deposit ${ethers.formatUnits(depositAmount, daiDecimals)} DAI...`);
          
          try {
            // Check if the strategy is paused
            const isPaused = await aaveStrategy.isPaused();
            if (isPaused) {
              console.log("⚠️ Strategy is paused. Attempting to unpause...");
              const unpauseTx = await aaveStrategy.unpause();
              await unpauseTx.wait();
              console.log("✅ Strategy unpaused successfully.");
            }
            
            console.log("Executing deposit transaction...");
            // Enable debug mode with higher gas limit for troubleshooting
            const depositTx = await aaveStrategy.deposit(depositAmount, {
              gasLimit: 2000000 // Higher gas limit for complex operations
            });
            
            console.log("Deposit transaction submitted. Waiting for confirmation...");
            const receipt = await depositTx.wait();
            console.log("✅ Deposit transaction successful! Hash:", receipt.hash);
            
            // Check values after deposit
            console.log("\n--- Step 6: Check Post-Deposit State ---");
            try {
              // Check total value in strategy
              const totalValue = await aaveStrategy.totalValue();
              console.log(`Total value in strategy: ${ethers.formatUnits(totalValue, daiDecimals)} DAI`);
              
              // Check total deposited amount tracked by the strategy
              const totalDeposited = await aaveStrategy.totalDeposited();
              console.log(`Total deposited tracked by strategy: ${ethers.formatUnits(totalDeposited, daiDecimals)} DAI`);
              
              // Check aToken balance of strategy
              const strategyATokenBalance = await aToken.balanceOf(strategyAddress);
              console.log(`Strategy aDAI balance: ${ethers.formatUnits(strategyATokenBalance, daiDecimals)} aDAI`);
              
              // Check any loose tokens not yet deposited
              const looseTokens = await dai.balanceOf(strategyAddress);
              console.log(`Loose DAI in strategy: ${ethers.formatUnits(looseTokens, daiDecimals)} DAI`);
              
              // Try to get APY information
              try {
                const estimatedAPY = await aaveStrategy.estimatedAPY();
                console.log(`Estimated APY: ${estimatedAPY.toString() / 100}%`);
              } catch (error) {
                console.log("⚠️ Could not get estimated APY:", error.message);
              }
              
              // Try to harvest immediately (will be minimal yield)
              console.log("\n--- Step 7: Test Harvest ---");
              console.log("Attempting to harvest yield (will likely be minimal initially)...");
              
              try {
                const harvestTx = await aaveStrategy.harvest({
                  gasLimit: 1000000
                });
                const harvestReceipt = await harvestTx.wait();
                console.log("✅ Harvest completed! Hash:", harvestReceipt.hash);
                
                // Try to withdraw half the amount
                console.log("\n--- Step 8: Test Withdrawal ---");
                const withdrawAmount = depositAmount / 2n;
                console.log(`Withdrawing ${ethers.formatUnits(withdrawAmount, daiDecimals)} DAI...`);
                
                try {
                  const withdrawTx = await aaveStrategy.withdraw(withdrawAmount, {
                    gasLimit: 1000000
                  });
                  const withdrawReceipt = await withdrawTx.wait();
                  console.log("✅ Withdrawal successful! Hash:", withdrawReceipt.hash);
                  
                  // Final checks
                  console.log("\n--- Final State Check ---");
                  const finalDaiBalance = await dai.balanceOf(deployer.address);
                  console.log(`Final DAI balance: ${ethers.formatUnits(finalDaiBalance, daiDecimals)} DAI`);
                  
                  const finalValue = await aaveStrategy.totalValue();
                  console.log(`Final value in strategy: ${ethers.formatUnits(finalValue, daiDecimals)} DAI`);
                  
                  // Test withdrawAll function
                  console.log("\n--- Step 9: Test WithdrawAll ---");
                  console.log("Withdrawing all remaining funds...");
                  
                  try {
                    const withdrawAllTx = await aaveStrategy.withdrawAll({
                      gasLimit: 1000000
                    });
                    const withdrawAllReceipt = await withdrawAllTx.wait();
                    console.log("✅ WithdrawAll successful! Hash:", withdrawAllReceipt.hash);
                    
                    const afterWithdrawAllValue = await aaveStrategy.totalValue();
                    console.log(`Value in strategy after withdrawAll: ${ethers.formatUnits(afterWithdrawAllValue, daiDecimals)} DAI`);
                    
                    const finalDaiBalanceAfterAll = await dai.balanceOf(deployer.address);
                    console.log(`Final DAI balance after withdrawAll: ${ethers.formatUnits(finalDaiBalanceAfterAll, daiDecimals)} DAI`);
                    
                    console.log("\n✅✅✅ Test completed successfully! ✅✅✅");
                    console.log("Strategy address:", strategyAddress);
                    
                  } catch (error) {
                    console.error("❌ WithdrawAll failed:", error);
                    console.log("Error message:", error.message);
                    
                    // If we can't withdraw all, try to log the detailed error
                    if (error.message.includes("execution reverted")) {
                      console.log("Checking error details...");
                      try {
                        // Try to get the revert reason using a static call
                        const revertReason = await ethers.provider.call(withdrawAllTx);
                        console.log("Revert reason:", revertReason);
                      } catch (innerError) {
                        console.log("Could not get revert reason:", innerError.message);
                      }
                    }
                  }
                  
                } catch (error) {
                  console.error("❌ Withdrawal failed:", error);
                  console.log("Error message:", error.message);
                }
              } catch (error) {
                console.error("❌ Harvest failed:", error);
                console.log("Error message:", error.message);
              }
            } catch (error) {
              console.error("❌ Failed to check post-deposit state:", error);
              console.log("Error message:", error.message);
            }
          } catch (error) {
            console.error("❌ Deposit failed:", error);
            console.log("Error message:", error.message);
            
            // If we get a generic "execution reverted" error, try to debug
            if (error.message.includes("execution reverted")) {
              console.log("\nAttempting to debug the deposit failure...");
              
              try {
                // First check if the deposit transaction is failing at the Aave level
                console.log("Testing direct Aave Pool interaction...");
                
                // First approve the Aave Pool directly
                const directApproveTx = await dai.approve(AAVE_POOL_ADDRESS, depositAmount);
                await directApproveTx.wait();
                console.log("✅ Direct Aave Pool approval successful");
                
                // Try to call the supply function directly on the pool to see if there's an issue
                try {
                  // Create a basic interface for the pool
                  const poolInterface = new ethers.Interface([
                    "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)"
                  ]);
                  
                  // Encode the calldata
                  const calldata = poolInterface.encodeFunctionData("supply", [
                    DAI_ADDRESS,
                    depositAmount,
                    deployer.address,
                    0
                  ]);
                  
                  // Send the transaction 
                  const directSupplyTx = await deployer.sendTransaction({
                    to: AAVE_POOL_ADDRESS,
                    data: calldata,
                    gasLimit: 2000000
                  });
                  
                  await directSupplyTx.wait();
                  console.log("✅ Direct Aave supply worked! The issue is in the strategy contract.");
                } catch (supplyError) {
                  console.error("❌ Direct Aave supply failed:", supplyError.message);
                  console.log("This suggests an issue with the Aave Pool interface, not your strategy.");
                  console.log("The Aave V3 Pool on Sepolia might have a different interface than expected.");
                }
              } catch (debugError) {
                console.error("Debug attempt failed:", debugError.message);
              }
            }
          }
        } catch (error) {
          console.error("❌ Approval failed:", error);
          console.log("Error message:", error.message);
        }
      } catch (error) {
        console.error("❌ Setting vault failed:", error);
        console.log("Error message:", error.message);
      }
    } catch (error) {
      console.error("❌ Deployment failed:", error);
      console.log("Error message:", error.message);
    }
  } catch (error) {
    console.error("❌ Test script error:", error);
    console.log("Error message:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });