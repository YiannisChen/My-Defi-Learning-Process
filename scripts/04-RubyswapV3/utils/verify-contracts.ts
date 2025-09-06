import { run } from "hardhat";

interface ContractInfo {
    address: string;
    constructorArguments?: any[];
    contract?: string;
}

export async function verifyContract(
    address: string,
    constructorArguments: any[] = [],
    contractPath?: string
) {
    console.log(`Verifying contract at ${address}...`);
    
    try {
        const verifyArgs: any = {
            address,
            constructorArguments,
        };
        
        if (contractPath) {
            verifyArgs.contract = contractPath;
        }
        
        await run("verify:verify", verifyArgs);
        console.log(`✅ Contract verified: ${address}`);
    } catch (error: any) {
        if (error.message.toLowerCase().includes("already verified")) {
            console.log(`ℹ️  Contract already verified: ${address}`);
        } else {
            console.error(`❌ Error verifying contract ${address}:`, error.message);
            throw error;
        }
    }
}

export async function verifyMultipleContracts(contracts: ContractInfo[]) {
    console.log(`Starting verification of ${contracts.length} contracts...`);
    
    for (const contract of contracts) {
        await verifyContract(
            contract.address,
            contract.constructorArguments || [],
            contract.contract
        );
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log("✅ All contracts verified!");
}

// Example usage function
async function main() {
    // This is an example - replace with actual deployed addresses
    const contracts: ContractInfo[] = [
        {
            address: "0x...", // Factory address
            constructorArguments: [],
            contract: "contracts/04-RubyswapV3/core-contracts/RubySwapFactory.sol:RubySwapFactory"
        },
        {
            address: "0x...", // Router address  
            constructorArguments: ["0x..."], // Factory address
            contract: "contracts/04-RubyswapV3/periphery/RubySwapRouter.sol:RubySwapRouter"
        },
        {
            address: "0x...", // Quoter address
            constructorArguments: ["0x..."], // Factory address
            contract: "contracts/04-RubyswapV3/periphery/RubySwapQuoter.sol:RubySwapQuoter"
        }
    ];
    
    await verifyMultipleContracts(contracts);
}

// Only run if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
} 