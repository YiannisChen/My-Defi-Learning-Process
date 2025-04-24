require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const Deployer_PRIVATE_KEY = process.env.Deployer_PRIVATE_KEY;
const User1_PRIVATE_KEY = process.env.User1_PRIVATE_KEY;
const User2_PRIVATE_KEY = process.env.User2_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true  // 用于解决 stack too deep 错误
        }
      },
      {
        version: "0.6.6", // Uniswap V2 需要的版本
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  networks: {
    // 主网测试配置
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [Deployer_PRIVATE_KEY, User1_PRIVATE_KEY, User2_PRIVATE_KEY],
    },
    
    // 本地开发配置
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
      // 可选：如果需要从Sepolia分叉
      forking: process.env.SEPOLIA_RPC_URL ? {
        url: SEPOLIA_RPC_URL,
        blockNumber: 5678000  // 可指定特定区块高度
      } : undefined
    },
    
    // 本地节点配置
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  paths: {
    sources: "./contracts",  // 指向你的合约目录
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};