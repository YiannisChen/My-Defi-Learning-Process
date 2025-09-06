import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Setting up RubySwap roles and permissions...");
    console.log("Deployer address:", await deployer.getAddress());
    
    // Get contract addresses from environment
    const timelockAddress = process.env.TIMELOCK_ADDRESS;
    const factoryAddress = process.env.FACTORY_ADDRESS;
    
    if (!timelockAddress || !factoryAddress) {
        throw new Error("TIMELOCK_ADDRESS and FACTORY_ADDRESS environment variables must be set");
    }
    
    console.log("Timelock address:", timelockAddress);
    console.log("Factory address:", factoryAddress);
    
    // Get contract instances
    const timelock = await ethers.getContractAt("RubySwapTimelock", timelockAddress);
    const factory = await ethers.getContractAt("RubySwapFactory", factoryAddress);
    
    // Grant admin roles to timelock
    console.log("Granting admin roles to timelock...");
    
    // Grant DEFAULT_ADMIN_ROLE to timelock
    const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    await timelock.grantRole(DEFAULT_ADMIN_ROLE, factoryAddress);
    console.log("Granted DEFAULT_ADMIN_ROLE to factory");
    
    // Grant PAUSER_ROLE to timelock
    const PAUSER_ROLE = await timelock.PAUSER_ROLE();
    await timelock.grantRole(PAUSER_ROLE, factoryAddress);
    console.log("Granted PAUSER_ROLE to factory");
    
    // Verify role assignments
    console.log("Verifying role assignments...");
    const hasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, factoryAddress);
    const hasPauserRole = await timelock.hasRole(PAUSER_ROLE, factoryAddress);
    
    console.log("Factory has DEFAULT_ADMIN_ROLE:", hasAdminRole);
    console.log("Factory has PAUSER_ROLE:", hasPauserRole);
    
    if (hasAdminRole && hasPauserRole) {
        console.log("Role setup completed successfully!");
    } else {
        console.error("Role setup failed!");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 