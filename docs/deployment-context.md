# Deployment Context

## Scripts
- Run factory: `npx hardhat run scripts/04-RubyswapV3/deploy/01-deploy-factory.ts --network sepolia`
- Run pools: `npx hardhat run scripts/04-RubyswapV3/deploy/02-deploy-pool.ts --network sepolia`
- Position Manager: `npx hardhat run scripts/04-RubyswapV3/deploy/03-deploy-position-manager.ts --network sepolia`
- Router: `npx hardhat run scripts/04-RubyswapV3/deploy/04-deploy-router.ts --network sepolia`
- Initial Pools: `npx hardhat run scripts/04-RubyswapV3/deploy/05-setup-initial-pools.ts --network sepolia`

## Initial Pools
- ETH/USDC (0.3%, tick spacing 60)
- ETH/USDT (0.3%, tick spacing 60)
- USDC/USDT (0.05%, tick spacing 10)

## Oracle Feeds (Sepolia examples)
- ETH/USD: <fill-address>
- USDC/USD: <fill-address>
- USDT/USD: <fill-address>

Note: The Audit AI Agent should verify that pool initialization uses Chainlink normalized prices and enforces the oracle registration requirement in the factory.
