require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const Deployer_PRIVATE_KEY = process.env.Deployer_PRIVATE_KEY;
const User1_PRIVATE_KEY = process.env.User1_PRIVATE_KEY;
const User2_PRIVATE_KEY = process.env.User2_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true  // Enable IR-based code generation to fix stack too deep errors
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [Deployer_PRIVATE_KEY, User1_PRIVATE_KEY, User2_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};