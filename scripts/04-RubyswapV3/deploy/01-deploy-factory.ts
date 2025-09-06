import { ethers } from "hardhat";

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log("Deployer:", await deployer.getAddress());

	// Get timelock address from environment or use a default
	const timelockAddress = process.env.TIMELOCK_ADDRESS;
	if (!timelockAddress) {
		throw new Error("TIMELOCK_ADDRESS environment variable not set");
	}

	console.log("Using timelock address:", timelockAddress);

	const Factory = await ethers.getContractFactory("RubySwapFactory");
	const factory = await Factory.deploy(timelockAddress);
	await factory.waitForDeployment();

	console.log("RubySwapFactory deployed at:", await factory.getAddress());
	console.log("Timelock set to:", timelockAddress);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
}); 