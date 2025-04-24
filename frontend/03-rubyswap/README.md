# RubySwap Frontend

A decentralized exchange interface for RubySwap, built with React and Web3.

## Live Demo

The application is deployed and accessible at:

- [https://yiannischen.xyz/](https://yiannischen.xyz/)

## Features

- Token swapping with ETH and ERC20 tokens
- Liquidity provision and removal
- Wallet connection with Web3
- Support for Ethereum Mainnet and Sepolia testnet
- Real-time price updates and slippage control
- Modern, responsive UI

## Local Development Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MetaMask or another Web3 wallet
- Infura API key (sign up at https://infura.io)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yiannischen/My-Defi-Learning-Process.git
cd frontend/03-rubyswap
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env` file in the root directory and add your configuration:

```env
# Required: Your Infura API endpoint
REACT_APP_NETWORK_URL="https://sepolia.infura.io/v3/your-infura-key"

# Required: Chain ID (11155111 for Sepolia, 1 for Mainnet)
REACT_APP_CHAIN_ID=11155111

# Optional: Network name for display
REACT_APP_NETWORK_NAME="Sepolia"
```

Make sure to replace `your-infura-key` with your actual Infura project ID.

### Running Locally

To start the development server:

```bash
npm start
# or
yarn start
```

The app will be available at `http://localhost:3000`.

### Building for Production

To create a production build:

```bash
npm run build
# or
yarn build
```

## Deployment

The production version is deployed at [https://yiannischen.xyz/](https://yiannischen.xyz/). To deploy your own instance:

1. Build the project using `npm run build` or `yarn build`
2. Deploy the contents of the `build` directory to your web server
3. Ensure your web server is configured to handle React router paths

## Contract Addresses

- Sepolia Testnet:
    - Router: `0x840f42cB68f7bf9E1bEAc7d74fD167E60DAbf2a3`
    - Factory: `0x85a58B0cDdb9D30c4c611369bC3d4aa1806C6e28`
    - WETH: `0xbD5eb2A4fBE5a69700470B9913CBfA3C01Bd0A20`

## Project Structure

```
src/
├── abis/          # Contract ABIs
├── components/    # Reusable React components
├── constants/     # Contract addresses and other constants
├── context/       # React context providers
├── hooks/         # Custom React hooks
├── pages/         # Main page components
└── utils/         # Utility functions
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
