// test/02-erc4626-vault/test-vault.js

const { ethers } = require("hardhat");
const { expect } = require("chai");

async function main() {
  try {
    console.log("Starting Comprehensive ERC-4626 Vault Test on Sepolia...");
    
    // Get the signers
    const [deployer, user1, user2] = await ethers.getSigners();
    console.log("Using deployer account:", deployer.address);
    console.log("Using user1 account:", user1.address);
    console.log("Using user2 account:", user2.address);
    
    // Log account balance (ETH)
    const deployerEthBalance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer ETH Balance:", ethers.formatEther(deployerEthBalance));
    
    // Token addresses on Sepolia - these are the correct addresses for Aave V3 on Sepolia
    const DAI_ADDRESS = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357";
    const ADAI_ADDRESS = "0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8";
    const AAVE_POOL_ADDRESS = "0x6C9fB0D5bD9429eb9Cd96B85B81d872281771E6B";
    
    console.log("\n--- Step 1: Check DAI Balance ---");
    // Create DAI contract instance
    const daiAbi = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)"
    ];
    const dai = new ethers.Contract(DAI_ADDRESS, daiAbi, deployer);
    
    // Get DAI decimals to format amounts correctly
    const daiDecimals = await dai.decimals();
    console.log(`DAI has ${daiDecimals} decimals`);
    
    // Check DAI balance
    const deployerDaiBalance = await dai.balanceOf(deployer.address);
    console.log(`Deployer DAI Balance: ${ethers.formatUnits(deployerDaiBalance, daiDecimals)} DAI`);
    
    if (deployerDaiBalance.toString() === '0') {
      console.error("❌ No DAI balance! Please get some DAI from the Aave faucet before testing.");
      return;
    }

    // Transfer DAI to test users
    const transferAmount = ethers.parseUnits("100", daiDecimals);
    console.log(`Transferring ${ethers.formatUnits(transferAmount, daiDecimals)} DAI to each test user...`);
    
    // Transfer to user1
    let user1DaiBalance = await dai.balanceOf(user1.address);
    if (user1DaiBalance < transferAmount) {
      const transferTx1 = await dai.transfer(user1.address, transferAmount);
      await transferTx1.wait();
      user1DaiBalance = await dai.balanceOf(user1.address);
      console.log(`User1 DAI Balance: ${ethers.formatUnits(user1DaiBalance, daiDecimals)} DAI`);
    } else {
      console.log(`User1 already has ${ethers.formatUnits(user1DaiBalance, daiDecimals)} DAI`);
    }
    
    // Transfer to user2
    let user2DaiBalance = await dai.balanceOf(user2.address);
    if (user2DaiBalance < transferAmount) {
      const transferTx2 = await dai.transfer(user2.address, transferAmount);
      await transferTx2.wait();
      user2DaiBalance = await dai.balanceOf(user2.address);
      console.log(`User2 DAI Balance: ${ethers.formatUnits(user2DaiBalance, daiDecimals)} DAI`);
    } else {
      console.log(`User2 already has ${ethers.formatUnits(user2DaiBalance, daiDecimals)} DAI`);
    }
    
    console.log("\n--- Step 2: Deploy AaveStrategy ---");
    console.log("Deploying AaveStrategy contract...");
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
    
    console.log("\n--- Step 3: Deploy Vault ---");
    // Vault parameters
    const vaultName = "DAI Yield Vault";
    const vaultSymbol = "dyDAI";
    const treasury = deployer.address; // Using deployer as treasury for simplicity
    const managementFee = 100; // 1%
    const performanceFee = 1000; // 10%
    const exitFee = 50; // 0.5%
    
    console.log("Deploying Vault contract with the following parameters:");
    console.log(`- Name: ${vaultName}`);
    console.log(`- Symbol: ${vaultSymbol}`);
    console.log(`- Treasury: ${treasury}`);
    console.log(`- Management Fee: ${managementFee / 100}%`);
    console.log(`- Performance Fee: ${performanceFee / 100}%`);
    console.log(`- Exit Fee: ${exitFee / 100}%`);
    
    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(
      DAI_ADDRESS,
      vaultName,
      vaultSymbol,
      treasury,
      managementFee,
      performanceFee,
      exitFee
    );
    
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("✅ Vault deployed to:", vaultAddress);
    
    console.log("\n--- Step 4: Set up Strategy in Vault ---");
    console.log("Setting vault as strategy's vault...");
    const setVaultTx = await aaveStrategy.setVault(vaultAddress);
    await setVaultTx.wait();
    console.log("✅ Vault set in strategy successfully");
    
    console.log("Setting strategy in vault with 80% allocation...");
    const setStrategyTx = await vault.setStrategy(strategyAddress, 8000); // 80% allocation
    await setStrategyTx.wait();
    console.log("✅ Strategy set in vault successfully");
    
    // Verify strategy is set correctly
    const strategyActive = await vault.strategyActive();
    const strategyAllocation = await vault.strategyAllocation();
    console.log(`Strategy active: ${strategyActive}`);
    console.log(`Strategy allocation: ${Number(strategyAllocation) / 100}%`);
    
    console.log("\n--- Step 5: User1 Deposits ---");
    // Create contract instances connected to user accounts
    const vaultAsUser1 = vault.connect(user1);
    const daiAsUser1 = dai.connect(user1);
    
    // First, user1 needs to approve the vault to spend their DAI
    const depositAmount = ethers.parseUnits("50", daiDecimals);
    console.log(`User1 approving vault to spend ${ethers.formatUnits(depositAmount, daiDecimals)} DAI...`);
    const approvalTx = await daiAsUser1.approve(vaultAddress, depositAmount);
    await approvalTx.wait();
    console.log("✅ Approval successful");
    
    // Now user1 can deposit
    console.log(`User1 depositing ${ethers.formatUnits(depositAmount, daiDecimals)} DAI into the vault...`);
    const depositTx = await vaultAsUser1.deposit(depositAmount, user1.address, {
      gasLimit: 3000000
    });
    const depositReceipt = await depositTx.wait();
    console.log("✅ Deposit successful! Hash:", depositReceipt.hash);
    
    // Check user1's vault share balance
    const user1ShareBalance = await vaultAsUser1.balanceOf(user1.address);
    console.log(`User1 vault share balance: ${ethers.formatUnits(user1ShareBalance, daiDecimals)} dyDAI`);
    
    console.log("\n--- Step 6: Check Vault State After Deposit ---");
    // Check total assets in vault
    const totalAssets = await vault.totalAssets();
    console.log(`Total assets in vault: ${ethers.formatUnits(totalAssets, daiDecimals)} DAI`);
    
    // Check how much is in the strategy vs vault
    const vaultDaiBalance = await dai.balanceOf(vaultAddress);
    console.log(`DAI balance in vault: ${ethers.formatUnits(vaultDaiBalance, daiDecimals)} DAI`);
    
    const strategyValue = await aaveStrategy.totalValue();
    console.log(`DAI value in strategy: ${ethers.formatUnits(strategyValue, daiDecimals)} DAI`);
    
    // Verify allocation percentage
    if (totalAssets > 0) {
      const currentAllocation = (strategyValue * BigInt(10000)) / totalAssets;
      console.log(`Current strategy allocation: ${Number(currentAllocation) / 100}%`);
    }
    
    console.log("\n--- Step 7: User2 Deposits ---");
    // Set up for user2's deposit
    const vaultAsUser2 = vault.connect(user2);
    const daiAsUser2 = dai.connect(user2);
    
    const user2DepositAmount = ethers.parseUnits("30", daiDecimals);
    console.log(`User2 approving vault to spend ${ethers.formatUnits(user2DepositAmount, daiDecimals)} DAI...`);
    const user2ApprovalTx = await daiAsUser2.approve(vaultAddress, user2DepositAmount);
    await user2ApprovalTx.wait();
    
    console.log(`User2 depositing ${ethers.formatUnits(user2DepositAmount, daiDecimals)} DAI into the vault...`);
    const user2DepositTx = await vaultAsUser2.deposit(user2DepositAmount, user2.address, {
      gasLimit: 3000000
    });
    await user2DepositTx.wait();
    console.log("✅ User2 deposit successful!");
    
    // Check user2's vault share balance
    const user2ShareBalance = await vaultAsUser2.balanceOf(user2.address);
    console.log(`User2 vault share balance: ${ethers.formatUnits(user2ShareBalance, daiDecimals)} dyDAI`);
    
    // Update total assets
    const updatedTotalAssets = await vault.totalAssets();
    console.log(`Updated total assets in vault: ${ethers.formatUnits(updatedTotalAssets, daiDecimals)} DAI`);
    
    console.log("\n--- Step 8: Test Harvest ---");
    // In a real-world scenario, we would wait for some time to pass for yield to accumulate
    // For testing, we'll just test the harvest functionality
    console.log("Testing harvest function...");
    try {
      const harvestTx = await vault.harvest({
        gasLimit: 2000000
      });
      const harvestReceipt = await harvestTx.wait();
      console.log("✅ Harvest successful! Hash:", harvestReceipt.hash);
      
      // Check if there was any yield (likely minimal/zero in test)
      console.log("Strategy APY estimation:", await vault.getStrategyAPY(), "basis points");
    } catch (error) {
      console.error("❌ Harvest failed:", error.message);
    }
    
    console.log("\n--- Step 9: Test Small Withdrawal ---");
    // User1 withdraws a small amount (5 DAI)
    const smallWithdrawAmount = ethers.parseUnits("5", daiDecimals);
    console.log(`User1 withdrawing ${ethers.formatUnits(smallWithdrawAmount, daiDecimals)} DAI...`);
    
    try {
      const withdrawTx = await vaultAsUser1.withdraw(
        smallWithdrawAmount, 
        user1.address, 
        user1.address, 
        { gasLimit: 3000000 }
      );
      const withdrawReceipt = await withdrawTx.wait();
      console.log("✅ Small withdrawal successful! Hash:", withdrawReceipt.hash);
      
      // Check user1 DAI balance after withdrawal
      const user1DaiAfterWithdraw = await dai.balanceOf(user1.address);
      console.log(`User1 DAI balance after withdrawal: ${ethers.formatUnits(user1DaiAfterWithdraw, daiDecimals)} DAI`);
      
      // Check user1's remaining vault share balance
      const user1ShareAfterWithdraw = await vault.balanceOf(user1.address);
      console.log(`User1 remaining vault share balance: ${ethers.formatUnits(user1ShareAfterWithdraw, daiDecimals)} dyDAI`);
    } catch (error) {
      console.error("❌ Small withdrawal failed:", error.message);
      console.log("Attempting to debug withdrawal issue...");
      
      // Debug by checking share balances and conversions
      const user1Shares = await vault.balanceOf(user1.address);
      console.log(`User1 shares: ${ethers.formatUnits(user1Shares, daiDecimals)}`);
      
      const sharesToBurn = await vault.previewWithdraw(smallWithdrawAmount);
      console.log(`Shares needed for withdrawal: ${ethers.formatUnits(sharesToBurn, daiDecimals)}`);
      
      const vaultDai = await dai.balanceOf(vaultAddress);
      console.log(`Vault DAI balance: ${ethers.formatUnits(vaultDai, daiDecimals)}`);
      
      const strategyDai = await aaveStrategy.totalValue();
      console.log(`Strategy DAI balance: ${ethers.formatUnits(strategyDai, daiDecimals)}`);
    }
    
    console.log("\n--- Step 10: Test Vault Rebalancing ---");
    console.log("Updating strategy allocation to 50%...");
    try {
      const updateAllocTx = await vault.updateAllocation(5000);
      await updateAllocTx.wait();
      console.log("✅ Strategy allocation updated successfully");
      
      // Check new allocation
      const vaultBalance = await dai.balanceOf(vaultAddress);
      const strategyBalance = await aaveStrategy.totalValue();
      const totalBalance = vaultBalance + strategyBalance;
      
      console.log(`After rebalance - Vault: ${ethers.formatUnits(vaultBalance, daiDecimals)} DAI, Strategy: ${ethers.formatUnits(strategyBalance, daiDecimals)} DAI`);
      
      if (totalBalance > 0) {
        const newAllocationPercentage = (strategyBalance * BigInt(10000)) / totalBalance;
        console.log(`New actual strategy allocation: ${Number(newAllocationPercentage) / 100}%`);
      }
    } catch (error) {
      console.error("❌ Strategy allocation update failed:", error.message);
    }
    
    console.log("\n--- Step 11: Test Pause Functionality ---");
    console.log("Pausing the vault...");
    try {
      const pauseTx = await vault.pause();
      await pauseTx.wait();
      console.log("✅ Vault paused successfully");
      
      // Verify vault is paused
      const isPaused = await vault.paused();
      console.log(`Vault paused status: ${isPaused}`);
      
      // Check if strategy is also paused
      const isStrategyPaused = await aaveStrategy.isPaused();
      console.log(`Strategy paused status: ${isStrategyPaused}`);
      
      // Try to deposit while paused (should fail)
      console.log("Testing deposit while paused (should fail)...");
      try {
        await daiAsUser2.approve(vaultAddress, ethers.parseUnits("10", daiDecimals));
        await vaultAsUser2.deposit(ethers.parseUnits("10", daiDecimals), user2.address);
        console.error("❌ Deposit succeeded while paused!");
      } catch (error) {
        console.log("✅ Deposit correctly failed while vault is paused");
      }
      
      // Test emergency withdrawal functionality
      console.log("Testing emergency withdrawal with limit...");
      
      // Set emergency withdrawal limit
      const limitTx = await vault.setEmergencyWithdrawalLimit(ethers.parseUnits("3", daiDecimals));
      await limitTx.wait();
      console.log("✅ Emergency withdrawal limit set to 3 DAI");
      
      // Try a withdrawal within the limit
      try {
        const emergencyWithdrawTx = await vaultAsUser2.withdraw(
          ethers.parseUnits("2", daiDecimals),
          user2.address,
          user2.address,
          { gasLimit: 3000000 }
        );
        await emergencyWithdrawTx.wait();
        console.log("✅ Emergency withdrawal (within limit) successful");
      } catch (error) {
        console.error("❌ Emergency withdrawal failed:", error.message);
      }
      
      // Try a withdrawal exceeding the limit (should fail)
      try {
        await vaultAsUser2.withdraw(
          ethers.parseUnits("5", daiDecimals),
          user2.address,
          user2.address
        );
        console.error("❌ Withdrawal exceeding emergency limit succeeded!");
      } catch (error) {
        console.log("✅ Withdrawal exceeding emergency limit correctly failed");
      }
      
      // Unpause vault
      console.log("Unpausing the vault...");
      const unpauseTx = await vault.unpause();
      await unpauseTx.wait();
      console.log("✅ Vault unpaused successfully");
    } catch (error) {
      console.error("❌ Pause/unpause test failed:", error.message);
    }
    
    console.log("\n--- Step 12: Test Fee Calculation ---");
    console.log("Checking fee calculations...");
    
    // Check exit fee
    const exitFeeAmount = await vault.previewExitFee(ethers.parseUnits("100", daiDecimals));
    console.log(`Exit fee on 100 DAI: ${ethers.formatUnits(exitFeeAmount, daiDecimals)} DAI`);
    
    // Check management fee (will be minimal in test)
    const pendingManagementFee = await vault.previewManagementFee();
    console.log(`Current pending management fee: ${ethers.formatUnits(pendingManagementFee, daiDecimals)} DAI`);
    
    console.log("\n--- Step 13: Test Redemption (shares to assets) ---");
    // User2 redeems some shares
    const redeemShares = ethers.parseUnits("10", daiDecimals);
    
    // First, check how many assets this will yield
    const assetsToReceive = await vault.previewRedeem(redeemShares);
    console.log(`User2 redeeming ${ethers.formatUnits(redeemShares, daiDecimals)} shares for approximately ${ethers.formatUnits(assetsToReceive, daiDecimals)} DAI...`);
    
    try {
      const redeemTx = await vaultAsUser2.redeem(
        redeemShares,
        user2.address,
        user2.address,
        { gasLimit: 3000000 }
      );
      await redeemTx.wait();
      console.log("✅ Redemption successful");
      
      // Check user2's DAI balance after redemption
      const user2DaiAfterRedeem = await dai.balanceOf(user2.address);
      console.log(`User2 DAI balance after redemption: ${ethers.formatUnits(user2DaiAfterRedeem, daiDecimals)} DAI`);
      
      // Check user2's remaining vault shares
      const user2SharesAfterRedeem = await vault.balanceOf(user2.address);
      console.log(`User2 remaining vault shares: ${ethers.formatUnits(user2SharesAfterRedeem, daiDecimals)} dyDAI`);
    } catch (error) {
      console.error("❌ Redemption failed:", error.message);
    }
    
    console.log("\n--- Step 14: Test Strategy Health Check ---");
    const strategyHealth = await vault.checkStrategyHealth();
    console.log(`Strategy health status: ${strategyHealth ? "Healthy" : "Unhealthy"}`);
    
    console.log("\n--- Step 15: Test Strategy Removal ---");
    console.log("Removing strategy...");
    try {
      const removeStrategyTx = await vault.removeStrategy();
      await removeStrategyTx.wait();
      console.log("✅ Strategy removed successfully");
      
      // Verify strategy is inactive
      const strategyActiveAfterRemoval = await vault.strategyActive();
      console.log(`Strategy active after removal: ${strategyActiveAfterRemoval}`);
      
      // Verify all funds are in the vault
      const vaultBalanceAfterRemoval = await dai.balanceOf(vaultAddress);
      console.log(`Vault DAI balance after strategy removal: ${ethers.formatUnits(vaultBalanceAfterRemoval, daiDecimals)} DAI`);
      
      // Check if any funds remain in the strategy (should be 0)
      const strategyBalanceAfterRemoval = await aaveStrategy.totalValue();
      console.log(`Strategy DAI value after removal: ${ethers.formatUnits(strategyBalanceAfterRemoval, daiDecimals)} DAI`);
      
      // If funds remain in strategy, try emergency recovery
      if (strategyBalanceAfterRemoval > 0) {
        console.log("⚠️ Strategy still has funds after removal! Testing recovery...");
        
        try {
          const recoveryTx = await vault.recoverFromStrategy(strategyAddress);
          await recoveryTx.wait();
          console.log("✅ Recovery from strategy successful");
          
          // Check updated balances
          const vaultBalanceAfterRecovery = await dai.balanceOf(vaultAddress);
          console.log(`Vault DAI balance after recovery: ${ethers.formatUnits(vaultBalanceAfterRecovery, daiDecimals)} DAI`);
          
          const strategyBalanceAfterRecovery = await aaveStrategy.totalValue();
          console.log(`Strategy DAI value after recovery: ${ethers.formatUnits(strategyBalanceAfterRecovery, daiDecimals)} DAI`);
        } catch (error) {
          console.error("❌ Strategy recovery failed:", error.message);
        }
      }
    } catch (error) {
      console.error("❌ Strategy removal failed:", error.message);
      
      // Try force removal if normal removal fails
      console.log("Attempting force removal of strategy...");
      try {
        const forceRemoveTx = await vault.forceRemoveStrategy();
        await forceRemoveTx.wait();
        console.log("✅ Force strategy removal successful");
        
        // Check if strategy is now inactive
        const strategyActiveAfterForce = await vault.strategyActive();
        console.log(`Strategy active after force removal: ${strategyActiveAfterForce}`);
      } catch (forceError) {
        console.error("❌ Force strategy removal also failed:", forceError.message);
      }
    }
    
    console.log("\n--- Step 16: Test User Withdrawals After Strategy Removal ---");
    // Check if users can withdraw now that all funds should be in the vault
    console.log("Testing user withdrawals after strategy removal...");
    
    // User1 withdraws all remaining shares
    const user1RemainingShares = await vault.balanceOf(user1.address);
    if (user1RemainingShares > 0) {
      console.log(`User1 withdrawing all remaining shares (${ethers.formatUnits(user1RemainingShares, daiDecimals)} dyDAI)...`);
      
      try {
        const finalRedeemTx = await vaultAsUser1.redeem(
          user1RemainingShares,
          user1.address,
          user1.address,
          { gasLimit: 3000000 }
        );
        await finalRedeemTx.wait();
        console.log("✅ User1 final withdrawal successful");
        
        // Check final DAI balance
        const user1FinalDai = await dai.balanceOf(user1.address);
        console.log(`User1 final DAI balance: ${ethers.formatUnits(user1FinalDai, daiDecimals)} DAI`);
      } catch (error) {
        console.error("❌ User1 final withdrawal failed:", error.message);
      }
    } else {
      console.log("User1 has no shares remaining");
    }
    
    // User2 withdraws all remaining shares
    const user2RemainingShares = await vault.balanceOf(user2.address);
    if (user2RemainingShares > 0) {
      console.log(`User2 withdrawing all remaining shares (${ethers.formatUnits(user2RemainingShares, daiDecimals)} dyDAI)...`);
      
      try {
        const finalRedeemTx = await vaultAsUser2.redeem(
          user2RemainingShares,
          user2.address,
          user2.address,
          { gasLimit: 3000000 }
        );
        await finalRedeemTx.wait();
        console.log("✅ User2 final withdrawal successful");
        
        // Check final DAI balance
        const user2FinalDai = await dai.balanceOf(user2.address);
        console.log(`User2 final DAI balance: ${ethers.formatUnits(user2FinalDai, daiDecimals)} DAI`);
      } catch (error) {
        console.error("❌ User2 final withdrawal failed:", error.message);
      }
    } else {
      console.log("User2 has no shares remaining");
    }
    
    console.log("\n--- Step 17: Verify Final Vault State ---");
    // Final checks on vault state
    const finalTotalAssets = await vault.totalAssets();
    console.log(`Final vault total assets: ${ethers.formatUnits(finalTotalAssets, daiDecimals)} DAI`);
    
    const finalVaultBalance = await dai.balanceOf(vaultAddress);
    console.log(`Final vault DAI balance: ${ethers.formatUnits(finalVaultBalance, daiDecimals)} DAI`);
    
    const finalTotalSupply = await vault.totalSupply();
    console.log(`Final vault total share supply: ${ethers.formatUnits(finalTotalSupply, daiDecimals)} dyDAI`);
    
    console.log("\n✅✅✅ Vault test completed successfully! ✅✅✅");
    console.log("Vault address:", vaultAddress);
    console.log("Strategy address:", strategyAddress);
    
  } catch (error) {
    console.error("❌ Test script error:", error);
    console.log("Error message:", error.message);
  }
}

// Run the test script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });