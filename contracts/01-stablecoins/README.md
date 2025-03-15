# Stablecoin Implementation: Reflections

## What I Built
- **CollateralizedStablecoin (cUSD)**: DAI-style with ETH collateral
- **SimpleDollar (USD)**: USDT/USDC-style centralized model

## Areas for Improvement

### Liquidation Mechanism
- Currently using simple direct liquidation instead of proper auctions
- Need to implement MakerDAO-style Dutch auctions and a system buffer
- Should use professional keeper networks instead of user-initiated liquidations

### Price Oracles
- Current oracle is manually updated by admin (not reliable for production)
- Should integrate Chainlink for decentralized price feeds
- Missing TWAP and oracle security module for protection

### Risk Parameters
- Using fixed collateralization ratio and stability fee
- Should implement dynamic parameters based on asset volatility
- Need debt ceilings and proper governance controls

### Next Steps
- Add auction-based liquidation
- Integrate with real oracles
- Support multiple collateral types
- Implement better risk management

## Resources for Future Reference
- USDT Contract: [https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7#code](https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7#code)
- DAI Documentation: [https://docs.makerdao.com/](https://docs.makerdao.com/)