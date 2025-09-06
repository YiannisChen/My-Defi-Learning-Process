import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const Token = await ethers.getContractFactory("MockERC20");
  const tokenA = await Token.deploy("TokenA", "TKA", 18);
  const tokenB = await Token.deploy("TokenB", "TKB", 6);
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  const Deployer = await ethers.getContractFactory("TestPoolDeployer");
  const poolDeployer = await Deployer.deploy(await deployer.getAddress());
  await poolDeployer.waitForDeployment();

  const fee = 3000;
  const tickSpacing = 60;
  const poolAddress = await poolDeployer.deploy.staticCall(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    fee,
    tickSpacing
  );
  await poolDeployer.deploy(await tokenA.getAddress(), await tokenB.getAddress(), fee, tickSpacing);

  console.log("RubySwapPool deployed at:", poolAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 