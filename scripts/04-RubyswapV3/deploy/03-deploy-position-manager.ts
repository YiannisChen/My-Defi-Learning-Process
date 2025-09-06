import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const WETH9 = process.env.WETH9_ADDRESS ?? ethers.ZeroAddress;
  const name = process.env.POSM_NAME ?? "RubySwap V3 Positions";
  const symbol = process.env.POSM_SYMBOL ?? "RUBY-V3-POS";

  if (!factoryAddress) throw new Error("FACTORY_ADDRESS env var not set");

  console.log("Deploying Position Manager with:", { factoryAddress, WETH9, name, symbol });
  const RubySwapPositionManager = await ethers.getContractFactory("RubySwapPositionManager");
  const posm = await RubySwapPositionManager.deploy(factoryAddress, WETH9, name, symbol);
  await posm.waitForDeployment();
  console.log("Position Manager deployed at:", await posm.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 