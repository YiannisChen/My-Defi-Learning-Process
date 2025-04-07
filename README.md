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
| 2 | [ERC-4626 Vault](./projects/02-erc4626-vault/) | Standard yield vaults | Completed! ✅ | Lessons 4-5 |
| 3 | [DEX with AMM](./projects/03-dex-amm/) | Uniswap-style exchange | In progress! 🔨 | Lessons 6-12 |
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
wrapped up the yield vault system following the ERC-4626 standard.

#### Key Features:
- **ERC-4626 Compliance**: Full implementation of the tokenized vault standard
- **Multi-Strategy Architecture**: Primary focus on Aave with plan to expand
- **Fee Structure**: Management (1%), performance (10%), and exit fees (0.5%)
- **Security Controls**: Role-based access and emergency pause functionality

#### Architecture:
```
User → Vault → Strategy → Aave Pool
```

#### DAI Yield Vault:
- **Contract**: `0xc9107A0a0684a4DECf1DB0C9e3Fd0f0F04361e66` (Sepolia)
- **Symbol**: dyDAI
- **Strategy Allocation**: 80-85% of assets directed to yield strategies
- **Current Strategy**: Aave lending (~3% APY)

#### Flow of Funds:
- **Deposits**: DAI → Vault → Strategy → Aave (receive aDAI)
- **Yield Generation**: aDAI balance increases over time
- **Withdrawals**: aDAI → DAI → Strategy → Vault → User
- **Harvesting**: Regular yield collection with performance fee

### DEX with AMM
Currently building a Uniswap V2-style exchange with:
- x*y=k constant product formula
- TWAP oracle for reliable price data
- Flash swap functionality
- Based on Lessons 6-12, 14-17

This is what I'm actively working on right now! My goal is to understand how Uniswap V2 actually works under the hood.

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
| ERC-4626 | ✅ | ✅ | ✅ |
| Uniswap V2 | ✅ | ✅ | 🔄 |
| Uniswap V3 | ✅ | Not yet | Not yet |
| Staking | ✅ | Not yet | Not yet |
| Lending | ✅ | Not yet | Not yet |

## 🔗 Deployed Contracts

| Project | Contract | Address | Explorer |
|---------|----------|---------|----------|
| SimpleDollar | Stablecoin | [0xE2997d5036dF4b7d679C62cc7e87592a81d36768](https://sepolia.etherscan.io/address/0xE2997d5036dF4b7d679C62cc7e87592a81d36768#code) | Sepolia |
| SimplePriceOracle | Oracle | [0x81e0Be288ea0b3d5790e631F39cbacF159012F15](https://sepolia.etherscan.io/address/0x81e0Be288ea0b3d5790e631F39cbacF159012F15#code) | Sepolia |
| CollateralizedStablecoin | Stablecoin | [0x19858f4fDF9D4451abEC344b5026E27bD4308f39](https://sepolia.etherscan.io/address/0x19858f4fDF9D4451abEC344b5026E27bD4308f39#code) | Sepolia |
| DAI Yield Vault | ERC-4626 | [0xc9107A0a0684a4DECf1DB0C9e3Fd0f0F04361e66](https://sepolia.etherscan.io/address/0xc9107A0a0684a4DECf1DB0C9e3Fd0f0F04361e66) | Sepolia |
| Aave Strategy | Strategy | [0x15D2c56Fe5e62634638292f36DD5E479F16d5B2d](https://sepolia.etherscan.io/address/0x15D2c56Fe5e62634638292f36DD5E479F16d5B2d) | Sepolia |

## 📚 Helpful Resources

- [Prof. Liang Peili's DeFi Course](https://space.bilibili.com/220951871/lists/2824381?type=season)
- [WTF Academy](https://wtf.academy/)
- [Ethereum.org DeFi](https://ethereum.org/en/defi/)
- [Uniswap Docs](https://docs.uniswap.org/)
- [EIP-4626: Tokenized Vault Standard](https://eips.ethereum.org/EIPS/eip-4626)
- [Aave Documentation](https://docs.aave.com/)
- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf)

## 🔮 Next Steps
- Finish my Uniswap V2 implementation
- Add a frontend to interact with my DEX
- Add a router contract for multi-hop swaps
- Start working on the staking rewards system
- Eventually tackle Uniswap V3-style concentrated liquidity