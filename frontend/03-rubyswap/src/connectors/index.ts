import { initializeConnector } from "@web3-react/core";
import { MetaMask } from "@web3-react/metamask";
import { Connector } from "@web3-react/types";

// Support Ethereum mainnet and Sepolia testnet
export const [injected, hooks] = initializeConnector<MetaMask>(
    (actions) => new MetaMask({ actions }),
);

// Export the connector array for the Web3ReactProvider
// Type assertion to ensure it matches what Web3ReactProvider expects
export const connectorHooks = [[injected, hooks] as [Connector, typeof hooks]];
