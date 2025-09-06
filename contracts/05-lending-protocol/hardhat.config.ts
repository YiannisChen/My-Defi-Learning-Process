require("ts-node/register");
const dotenv = require("dotenv");
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@typechain/hardhat");

dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const accounts = [];
if (DEPLOYER_PRIVATE_KEY) accounts.push(DEPLOYER_PRIVATE_KEY);

if (accounts.length === 0) {
    console.log("⚠️  No private keys found in .env file, using default hardhat accounts");
    accounts.push("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
}

module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            viaIR: true,
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        sepolia: {
            url: SEPOLIA_RPC_URL,
            url: SEPOLIA_RPC_URL,
            accounts: accounts,
            chainId: 11155111,
            gas: 6000000,
            gasPrice: 20000000000,
            timeout: 60000
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    typechain: {
        outDir: "../typechain",
        target: "ethers-v6",
    },
    paths: {
        sources: "./",
        tests: "../../test/05-lending-protocol",
        cache: "../../cache",
        artifacts: "../../artifacts",
    },
}; 