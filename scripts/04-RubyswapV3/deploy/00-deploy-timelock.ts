import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Deploying RubySwap Timelock...");
    console.log("Deployer address:", await deployer.getAddress());
    
    // Deploy timelock with 48-hour minimum delay
    const RubySwapTimelock = await ethers.getContractFactory("RubySwapTimelock");
    
    // Initial setup: deployer is proposer, executor, and admin
    const proposers = [await deployer.getAddress()];
    const executors = [await deployer.getAddress()];
    const admin = await deployer.getAddress();
    
    const timelock = await RubySwapTimelock.deploy(proposers, executors, admin);
    await timelock.waitForDeployment();
    
    console.log("Timelock deployed to:", await timelock.getAddress());
    console.log("Minimum delay:", await timelock.getMinDelay(), "seconds");
    console.log("Initial proposers:", proposers);
    console.log("Initial executors:", executors);
    console.log("Admin:", admin);
    
    // Verify the deployment
    console.log("Timelock deployment completed successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 