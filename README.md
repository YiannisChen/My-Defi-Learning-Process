# My DeFi Learning Journey

> Building DeFi protocols from scratch to understand how they actually work under the hood.

## What's in here

- [The Projects](#the-projects)
- [Live Demo](#live-demo)
- [Tech Stack](#tech-stack)
- [How to run this](#how-to-run-this)
- [Deployed contracts](#deployed-contracts)

## The Projects

### 1. [Stablecoins](./contracts/01-stablecoins/)
**Status**: ✅ Done

Built two different stablecoin designs:
- **USDT-style**: Simple fiat-backed with admin controls
- **DAI-style**: ETH-collateralized with liquidation (150% collateral, 125% liquidation threshold)

Learned: How stablecoins maintain peg, liquidation mechanics, oracle integration

### 2. [ERC-4626 Yield Vault](./contracts/02-erc4626-vault/)
**Status**: ✅ Done

Standard-compliant vault that auto-compounds through Aave:
- Full ERC-4626 compliance (the "vault standard")
- 1% management fee, 10% performance fee
- Emergency pause and role-based access

**Deployed**: `0xc9107A0a0684a4DECf1DB0C9e3Fd0f0F04361e66` (Sepolia)

### 3. [RubySwap V2](./contracts/03-dexV2-clone/)
**Status**: ✅ Done

Uniswap V2 clone with working frontend:
- x*y=k AMM math
- Flash swaps for arbitrage
- Factory creates pairs, Router handles swaps
- React frontend with MetaMask

**Live Demo**: [https://yiannischen.xyz/](https://yiannischen.xyz/)

### 4. [RubySwap V3](./contracts/04-RubyswapV3/)
**Status**: ✅ Core done, Phase 2 planned

Uniswap V3 with concentrated liquidity:
- Tick-based price ranges (way more complex than V2)
- Multiple fee tiers (0.05%, 0.3%, 1%)
- NFT positions for LP tokens
- Oracle integration with Chainlink

**Deployed on Sepolia**:
- Factory: `0xDc6068B51fA61705ad9d0D85B7Ec0E4677Ee95ba`
- Router: `0xbEa13c8b37A5132488950c706FA41fC53ee0cDBa`
- Position Manager: `0xfa70F74162e90E8647F386F79E0c814BC1dBf470`

### 5. [Lending Protocol](./contracts/05-lending-protocol/)
**Status**: 📋 Next up

Compound/Aave style lending:
- Supply/borrow with interest rates
- Collateral management
- Liquidation when undercollateralized

## Live Demo

**RubySwap V2**: [https://yiannischen.xyz/](https://yiannischen.xyz/)

Swap ETH/RUBY, add liquidity, see real-time prices. Works on Sepolia testnet.

## Tech Stack

**Smart Contracts**:
- Solidity 0.8.24
- Hardhat for testing/deployment
- OpenZeppelin for security patterns
- Chainlink for price feeds

**Frontend**:
- React 18
- Ethers.js for Web3
- Styled Components
- MetaMask integration

## How to run this

```bash
# Clone and install
git clone https://github.com/YiannisChen/My-Defi-Learning-Process.git
cd My-Defi-Learning-Process
npm install

# Run tests
cd contracts/04-RubyswapV3
npm test

# Deploy to Sepolia (need .env with private key)
npm run deploy:sepolia
```

## Deployed contracts

| Project | Contract | Address | Network |
|---------|----------|---------|---------|
| SimpleDollar | Stablecoin | `0xE2997d5036dF4b7d679C62cc7e87592a81d36768` | Sepolia |
| Price Oracle | Oracle | `0x81e0Be288ea0b3d5790e631F39cbacF159012F15` | Sepolia |
| DAI Yield Vault | ERC-4626 | `0xc9107A0a0684a4DECf1DB0C9e3Fd0f0F04361e66` | Sepolia |
| RubySwap V2 Router | Router | `0x840f42cB68f7bf9E1bEAc7d74fD167E60DAbf2a3` | Sepolia |
| RubySwap V2 Factory | Factory | `0x85a58B0cDdb9D30c4c611369bC3d4aa1806C6e28` | Sepolia |
| RubySwap V3 Factory | Factory | `0xDc6068B51fA61705ad9d0D85B7Ec0E4677Ee95ba` | Sepolia |
| RubySwap V3 Router | Router | `0xbEa13c8b37A5132488950c706FA41fC53ee0cDBa` | Sepolia |

## What I learned

- **AMM Math**: How x*y=k works, concentrated liquidity, tick calculations
- **Oracle Integration**: Chainlink feeds, TWAP, price manipulation protection
- **Security Patterns**: Reentrancy guards, access control, input validation
- **Gas Optimization**: Assembly code, storage packing, function visibility
- **Frontend Integration**: Web3 providers, transaction handling, error states

## Next steps

- [ ] Complete lending protocol
- [ ] Add limit orders to RubySwap V3
- [ ] Implement position staking/farming
- [ ] Add more test coverage
- [ ] Deploy to mainnet (when ready)

---

*Started this to understand DeFi better. Turns out building it from scratch teaches you way more than just using it.*
