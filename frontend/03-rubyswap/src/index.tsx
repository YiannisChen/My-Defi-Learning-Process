import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Web3ReactProvider } from "@web3-react/core";
import { Web3Provider } from "@ethersproject/providers";
import { initializeConnector } from "@web3-react/core";
import { MetaMask } from "@web3-react/metamask";

const [metaMask, hooks] = initializeConnector<MetaMask>(
    (actions) => new MetaMask({ actions }),
);

const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement,
);

root.render(
    <React.StrictMode>
        <Web3ReactProvider connectors={[[metaMask, hooks]]}>
            <App />
        </Web3ReactProvider>
    </React.StrictMode>,
);
