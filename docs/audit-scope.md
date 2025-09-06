# Audit Scope

## In Scope
- `core-contracts/RubySwapPool.sol`
- `core-contracts/RubySwapFactory.sol`
- `periphery/RubySwapRouter.sol`
- `periphery/RubySwapPositionManager.sol`
- `periphery/RubySwapQuoter.sol`
- Libraries: `TickMath.sol`, `SqrtPriceMath.sol`, `SwapMath.sol`, `LiquidityMath.sol`, `LiquidityAmounts.sol`, `SafeCast.sol`, `Path.sol`, `Tick.sol`, `TickBitmap.sol`, `Oracle.sol`, `OracleLibrary.sol`, `Position.sol`, `BitMath.sol`, `FixedPoint96.sol`, `FixedPoint128.sol`
- Interfaces and callbacks required by the above

## Focus Areas
- Reentrancy in swap/callback flows
- Oracle deviation logic (3% Chainlink vs TWAP)
- Mathematical correctness (ticks, price, liquidity math)
- Slippage protection in Router (exact input/output, multi-hop)
- Protocol fee accounting and collection

## Out of Scope (Phase 2+)
- Limit orders / keeper execution
- Yield farming / NFT staking
- Cross-chain integrations
