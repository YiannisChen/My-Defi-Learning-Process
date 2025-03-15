// test/01-stablecoins/check-roles.js
const { ethers } = require("hardhat");

async function main() {
  const [account] = await ethers.getSigners();
  console.log("Checking with account:", account.address);
  
  // Oracle 地址
  const oracleAddress = "0x81e0Be288ea0b3d5790e631F39cbacF159012F15";
  const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
  const oracle = SimplePriceOracle.attach(oracleAddress);
  
  // 检查角色
  const DEFAULT_ADMIN_ROLE = await oracle.DEFAULT_ADMIN_ROLE();
  const PRICE_UPDATER_ROLE = await oracle.PRICE_UPDATER_ROLE();
  
  const hasAdminRole = await oracle.hasRole(DEFAULT_ADMIN_ROLE, account.address);
  const hasPriceUpdaterRole = await oracle.hasRole(PRICE_UPDATER_ROLE, account.address);
  
  console.log("Has admin role:", hasAdminRole);
  console.log("Has price updater role:", hasPriceUpdaterRole);
  
  if (hasPriceUpdaterRole) {
    console.log("\nTesting price update...");
    try {
      const currentPrice = await oracle.getEthPrice();
      console.log("Current price: $" + ethers.formatUnits(currentPrice, 18));
      
      // 尝试更新价格
      const newPrice = ethers.parseUnits("1900.0", 18);
      const tx = await oracle.updatePrice(newPrice);
      await tx.wait();
      
      const updatedPrice = await oracle.getEthPrice();
      console.log("Updated price: $" + ethers.formatUnits(updatedPrice, 18));
      
      if (updatedPrice.toString() === newPrice.toString()) {
        console.log("✅ Price update successful!");
      } else {
        console.log("❌ Price update failed!");
      }
    } catch (error) {
      console.log("Error updating price:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });