import path from "path";
import dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "solidity-coverage";
import { HardhatUserConfig } from "hardhat/config";

// Load env from repo root regardless of module system
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org";
const RAW_DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.Deployer_PRIVATE_KEY;

const accounts: string[] = [];
if (RAW_DEPLOYER_PRIVATE_KEY) accounts.push(RAW_DEPLOYER_PRIVATE_KEY);

if (accounts.length === 0) {
    // eslint-disable-next-line no-console
    console.log("⚠️  No private keys found in .env file, using default hardhat accounts");
    accounts.push("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
}

const isCoverage = process.env.COVERAGE === 'true';

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: true,
        },
        overrides: {
            // Keep pool with viaIR to avoid stack-too-deep while default remains false
            "core-contracts/RubySwapPool.sol": {
                settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
            },
            "contracts/04-RubyswapV3/core-contracts/RubySwapPool.sol": {
                settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
            },
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        sepolia: {
            url: SEPOLIA_RPC_URL,
            accounts: accounts,
            chainId: 11155111,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    typechain: {
        outDir: "../typechain",
        target: "ethers-v6",
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: 'USD',
        gasPrice: 21,
        showTimeSpent: true,
        excludeContracts: ['mocks/'],
    },
    coverage: {
        exclude: ['test/', 'scripts/'],
    },
    paths: {
        sources: "./",
        tests: "../../test/04-RubyswapV3",
        cache: "../../cache",
        artifacts: "../../artifacts",
    },
};

export default config; 