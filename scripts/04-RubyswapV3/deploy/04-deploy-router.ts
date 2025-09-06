import { ethers } from "hardhat";

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const WETH9 = process.env.WETH9_ADDRESS ?? ethers.ZeroAddress;
  if (!factoryAddress) throw new Error("FACTORY_ADDRESS env var not set");

  console.log("Deploying Router with:", { factoryAddress, WETH9 });
  const RubySwapRouter = await ethers.getContractFactory("RubySwapRouter");
  const router = await RubySwapRouter.deploy(factoryAddress, WETH9);
  await router.waitForDeployment();
  console.log("Router deployed at:", await router.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 