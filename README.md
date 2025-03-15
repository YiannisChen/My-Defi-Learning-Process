# 🚀 My DeFi Learning Journey

Hey! So I'm diving back into Solidity after my initial crash course on WTF Academy. This time I'm following Professor Liang Peili's awesome DeFi videos - he's this blockchain teacher I really look up to from my university.

## 👋 What's This All About?

This repo is basically my playground for building DeFi stuff I'm learning from Prof. Liang's course. I'm getting my hands dirty with all the cool protocols:

- Building different types of stablecoins
- Creating yield vaults using ERC-4626
- Setting up my own mini DEXs with AMMs
- Coding staking and reward systems
- Making simple lending protocols

## 📝 Projects I'm Working On

| # | Project | What It Is | Where I'm At | Related Lessons |
|---|---------|------------|--------------|----------------|
| 1 | [Stablecoins](./projects/01-stablecoins/) | Different ways to make stable tokens | Completed! ✅ | Lessons 2-3 |
| 2 | [ERC-4626 Vault](./projects/02-erc4626-vault/) | Standard yield vaults | On the to-do list | Lessons 4-5 |
| 3 | [DEX with AMM](./projects/03-dex-amm/) | Uniswap-style exchange | Coming soon | Lessons 6-12 |
| 4 | [Staking Rewards](./projects/04-staking-rewards/) | Stake tokens, earn rewards | Coming soon | Lesson 13 |
| 5 | [Lending Protocol](./projects/05-lending-protocol/) | Borrow and lend stuff | Coming soon | Lesson 19 |

## 🛠️ Tech I'm Using

- **Smart Contracts**: Solidity (obviously!)
- **Dev Framework**: Hardhat
- **Testing**: Waffle, Chai, Ethers.js
- **Frontend**: Basic React stuff
- **Deployment**: Sepolia testnet

## 🔍 More About Each Project

### Stablecoins
I've completed two different flavors of stablecoins:
- **Fiat-backed stablecoin (SimpleDollar)**: Similar to USDT/USDC with centralized issuance
  - ERC20 implementation with 18 decimals
  - Role-based access control (admin, minter, pauser, blacklister)
  - Blacklist functionality for regulatory compliance
  - Pause/unpause capability for emergencies

- **Collateralized stablecoin**: Similar to DAI with ETH collateralization
  - ETH-collateralized with over-collateralization (150%)
  - Price oracle for ETH/USD conversion
  - Vault system with collateralization management
  - Liquidation mechanism (125% threshold with 10% penalty)
  - 1% stability fee implementation

### ERC-4626 Vault
Building standard token vaults with:
- Ways to deposit and withdraw
- Strategies for generating yield
- Based on Lessons 4-5

### DEX with AMM
Creating a simple exchange with:
- x*y=k formula like Uniswap V2
- TWAP oracle for price data
- Flash swap functionality
- Based on Lessons 6-12, 14-17

### Staking Rewards
Setting up a staking system with:
- Time-based rewards
- Proper reward calculations
- Based on Lesson 13

### Lending Protocol
Making a basic lending system with:
- Supply and borrow mechanics
- Different interest rate models
- Based on Lesson 19

## 📊 How Far I've Come

| Topic | Finished Learning | Started Building | Completed |
|-------|-------------------|------------------|-----------|
| Stablecoins | ✅ | ✅ | ✅ |
| ERC-4626 | ✅ | Not yet | Not yet |
| DEX Basics | ✅ | Not yet | Not yet |
| Uniswap V2 | ✅ | Not yet | Not yet |
| Uniswap V3 | ✅ | Not yet | Not yet |
| Staking | ✅ | Not yet | Not yet |
| Lending | ✅ | Not yet | Not yet |

## 🔗 Deployed Contracts

| Project | Contract Address | Explorer |
|---------|------------------|----------|
| SimpleDollar | [0xE2997d5036dF4b7d679C62cc7e87592a81d36768](https://sepolia.etherscan.io/address/0xE2997d5036dF4b7d679C62cc7e87592a81d36768#code) | Sepolia |
| SimplePriceOracle | [0x81e0Be288ea0b3d5790e631F39cbacF159012F15](https://sepolia.etherscan.io/address/0x81e0Be288ea0b3d5790e631F39cbacF159012F15#code) | Sepolia |
| CollateralizedStablecoin | [0x19858f4fDF9D4451abEC344b5026E27bD4308f39](https://sepolia.etherscan.io/address/0x19858f4fDF9D4451abEC344b5026E27bD4308f39#code) | Sepolia |


🧪 Testing and Verification
For those new to Hardhat, here's how to deploy and interact with the contracts:
bashCopy# Install dependencies first
npm install

# Compile all contracts
npx hardhat compile

# Test contracts locally
npx hardhat test

# Deploy a contract to Sepolia testnet
npx hardhat run scripts/01-stablecoins/deploy-SimpleDollar.js --network sepolia

# Verify contract on Etherscan (replace with your contract's address)
npx hardhat verify --network sepolia 0xYourContractAddress "Constructor Param 1" "Constructor Param 2"

# Run a script to interact with deployed contracts
npx hardhat run scripts/01-stablecoins/test-sepolia-connection.js --network sepolia
Make sure your .env file contains:
CopyPRIVATE_KEY=your_wallet_private_key
SEPOLIA_RPC_URL=your_sepolia_rpc_endpoint
ETHERSCAN_API_KEY=your_etherscan_api_key

## 📝 Implementation Notes
- Fixed self-liquidation issue in CollateralizedStablecoin contract
- Updated to OpenZeppelin v5 compatibility (replaced `_beforeTokenTransfer` with `_update`)
- Oracle price configurable by accounts with PRICE_UPDATER_ROLE
- Liquidations must be performed by an account different from the vault owner

## 📚 Helpful Resources

- [Prof. Liang Peili's DeFi Course](https://space.bilibili.com/220951871/lists/2824381?type=season)
- [WTF Academy](https://wtf.academy/)
- [Ethereum.org DeFi](https://ethereum.org/en/defi/)
- [Uniswap Docs](https://docs.uniswap.org/)

## 🔮 Next Steps
- Test the liquidation functionality with multiple accounts
- Implement the ERC-4626 vault project
- Consider adding maximum debt caps and emergency shutdown features
- Begin working on DEX with AMM implementation